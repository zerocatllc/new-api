package controller

import (
	"errors"
	"net/http"
	"strconv"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/dto"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/setting/storage_setting"
	"github.com/QuantumNous/new-api/setting/ticket_setting"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

const (
	ticketMessagePageDefault = 50
	ticketMessagePageMax     = 100
)

func ticketToResponse(t *model.Ticket) dto.TicketResponse {
	return dto.TicketResponse{
		PublicId:            t.PublicId,
		UserId:              t.UserId,
		InitiatedBy:         t.InitiatedBy,
		Subject:             t.Subject,
		Category:            t.Category,
		Priority:            t.Priority,
		Status:              t.Status,
		WaitingOn:           t.WaitingOn,
		AssignedTo:          t.AssignedTo,
		MessageCount:        t.MessageCount,
		Version:             t.Version,
		CreatedAt:           t.CreatedAt,
		UpdatedAt:           t.UpdatedAt,
		ResolvedAt:          t.ResolvedAt,
		DeletedAt:           t.DeletedAt,
		DeletedByUserId:     t.DeletedByUserId,
		LastMessageAt:       t.LastMessageAt,
		LastPublicMessageAt: t.LastPublicMessageAt,
	}
}

func ticketMessageToResponse(m *model.TicketMessage) dto.TicketMessageResponse {
	return dto.TicketMessageResponse{
		Id:             m.Id,
		AuthorUserId:   m.AuthorUserId,
		AuthorKind:     m.AuthorKind,
		Visibility:     m.Visibility,
		Body:           m.Body,
		AttachmentUrls: m.DecodedAttachmentUrls(),
		CreatedAt:      m.CreatedAt,
	}
}

func ticketMessagesToResponse(messages []model.TicketMessage) []dto.TicketMessageResponse {
	result := make([]dto.TicketMessageResponse, 0, len(messages))
	for i := range messages {
		result = append(result, ticketMessageToResponse(&messages[i]))
	}
	return result
}

// ticketToOwnerResponse is the user-facing variant of ticketToResponse: it
// strips AssignedTo. public_id exists precisely so customers cannot enumerate
// internal sequential IDs, and handing the same customer the assigned staff
// member's numeric account id defeats that design from a different field.
// The ticket owner has no legitimate use for the raw staff user id.
func ticketToOwnerResponse(t *model.Ticket) dto.TicketResponse {
	response := ticketToResponse(t)
	response.AssignedTo = nil
	return response
}

// ticketMessageToOwnerResponse strips AuthorUserId for the same reason: the
// owner-facing UI only needs author_kind (you / support / system) to label a
// message, never the internal numeric id of the staff replier.
func ticketMessageToOwnerResponse(m *model.TicketMessage) dto.TicketMessageResponse {
	response := ticketMessageToResponse(m)
	response.AuthorUserId = 0
	return response
}

func ticketMessagesToOwnerResponse(messages []model.TicketMessage) []dto.TicketMessageResponse {
	result := make([]dto.TicketMessageResponse, 0, len(messages))
	for i := range messages {
		result = append(result, ticketMessageToOwnerResponse(&messages[i]))
	}
	return result
}

// classifyTicketError maps the model layer's sentinel/gorm errors to a
// human-readable message plus whether the failure was a version conflict —
// the classification handleTicketModelError applies to a single-request
// response and the bulk endpoints (controller/ticket_batch.go) apply per item.
func classifyTicketError(err error) (message string, versionConflict bool) {
	switch {
	case errors.Is(err, gorm.ErrRecordNotFound):
		return "ticket not found", false
	case errors.Is(err, model.ErrTicketVersionConflict):
		return err.Error(), true
	default:
		return err.Error(), false
	}
}

// handleTicketModelError maps the model layer's sentinel/gorm errors to the
// response shapes the frontend expects, instead of leaking a raw SQL message.
func handleTicketModelError(c *gin.Context, err error) {
	message, versionConflict := classifyTicketError(err)
	if versionConflict {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": message,
			"data":    gin.H{"version_conflict": true},
		})
		return
	}
	common.ApiErrorMsg(c, message)
}

// parseTicketListFilter reads the filter fields shared by the user and admin
// ticket list endpoints. The admin endpoint layers assigned_to on top via
// parseTicketAdminListFilter.
func parseTicketListFilter(c *gin.Context) model.TicketListFilter {
	return model.TicketListFilter{
		Status:   c.Query("status"),
		Category: c.Query("category"),
		Priority: c.Query("priority"),
		Keyword:  c.Query("keyword"),
	}
}

// validateTicketAttachmentUrlsBelongToCaller rejects any attachment reference
// that was not issued for an upload by callerUserID. A storage URL alone is
// not enough: without provenance binding
// a caller could reference *any* object under the shared storage bucket in
// their own ticket message — the ticket-ownership check the download
// endpoint applies only proves the caller owns the *referencing* ticket, not
// that they uploaded the *referenced* object — turning the presigned-download
// endpoint into an arbitrary-object-read primitive for anything not yet
// referenced by a legitimate message. Binding to model.TicketAttachmentUpload
// (written at upload time) closes that at the write path instead of trying
// to patch it at the read path.
func validateTicketAttachmentUrlsBelongToCaller(urls []string, callerUserID int) error {
	if len(urls) == 0 {
		return nil
	}
	ok, err := model.TicketAttachmentReferencesBelongToUploader(urls, callerUserID)
	if err != nil {
		return err
	}
	if !ok {
		return errors.New("attachment url was not uploaded by you")
	}
	return nil
}

func parseTicketMessagePageParams(c *gin.Context) (beforeID int64, limit int) {
	beforeID, _ = strconv.ParseInt(c.Query("before_id"), 10, 64)
	limit, _ = strconv.Atoi(c.Query("limit"))
	if limit <= 0 {
		limit = ticketMessagePageDefault
	}
	if limit > ticketMessagePageMax {
		limit = ticketMessagePageMax
	}
	return beforeID, limit
}

// CreateTicket opens a new ticket for the authenticated user.
func CreateTicket(c *gin.Context) {
	if !ticket_setting.Enabled() {
		common.ApiErrorMsg(c, "the ticket system is currently disabled")
		return
	}
	var req dto.CreateTicketRequest
	if err := common.UnmarshalBodyReusableStrict(c, &req); err != nil {
		common.ApiErrorMsg(c, "invalid request: "+err.Error())
		return
	}
	userID := c.GetInt("id")
	if err := validateTicketAttachmentUrlsBelongToCaller(req.AttachmentUrls, userID); err != nil {
		common.ApiErrorMsg(c, err.Error())
		return
	}
	ticket, _, err := service.CreateTicket(userID, model.TicketInitiatedByUser, req.Category, req.Priority, req.Subject, req.Body, req.ClientRequestId, req.AttachmentUrls...)
	if err != nil {
		common.ApiErrorMsg(c, err.Error())
		return
	}
	common.ApiSuccess(c, ticketToOwnerResponse(ticket))
}

// GetTicketCapabilities lets the authenticated ticket page disable controls
// before the user fills a form that the server cannot currently accept.
func GetTicketCapabilities(c *gin.Context) {
	attachmentsEnabled, _ := storage_setting.Availability()
	common.ApiSuccess(c, gin.H{
		"enabled":             ticket_setting.Enabled(),
		"attachments_enabled": attachmentsEnabled,
	})
}

// ListMyTickets returns one filtered page of the caller's own tickets.
func ListMyTickets(c *gin.Context) {
	userID := c.GetInt("id")
	pageInfo := common.GetPageQuery(c)
	filter := parseTicketListFilter(c)
	tickets, total, err := model.ListTicketsForUser(userID, filter, pageInfo.GetStartIdx(), pageInfo.GetPageSize())
	if err != nil {
		common.ApiError(c, err)
		return
	}
	ticketIDs := make([]int64, 0, len(tickets))
	for i := range tickets {
		ticketIDs = append(ticketIDs, tickets[i].Id)
	}
	unreadByTicket, err := model.CountUnreadPublicStaffForTickets(ticketIDs, userID)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	items := make([]dto.TicketResponse, 0, len(tickets))
	for i := range tickets {
		item := ticketToOwnerResponse(&tickets[i])
		unread := unreadByTicket[tickets[i].Id]
		item.UnreadCount = &unread
		items = append(items, item)
	}
	common.ApiSuccess(c, gin.H{
		"items":     items,
		"total":     total,
		"page":      pageInfo.GetPage(),
		"page_size": pageInfo.GetPageSize(),
	})
}

// GetMyTicketStats returns the caller's own ticket counts by status.
func GetMyTicketStats(c *gin.Context) {
	userID := c.GetInt("id")
	byStatus, err := model.CountTicketsByStatus(&userID)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	var total int64
	for _, count := range byStatus {
		total += count
	}
	common.ApiSuccess(c, gin.H{"total": total, "by_status": byStatus})
}

// GetMyTicket returns one of the caller's own tickets by public id.
func GetMyTicket(c *gin.Context) {
	userID := c.GetInt("id")
	ticket, err := model.GetOwnedTicket(c.Param("public_id"), userID)
	if err != nil {
		handleTicketModelError(c, err)
		return
	}
	common.ApiSuccess(c, ticketToOwnerResponse(ticket))
}

// ListMyTicketMessages returns a public-only keyset page of a ticket's
// messages, scoped to the caller's ownership.
func ListMyTicketMessages(c *gin.Context) {
	userID := c.GetInt("id")
	ticket, err := model.GetOwnedTicket(c.Param("public_id"), userID)
	if err != nil {
		handleTicketModelError(c, err)
		return
	}
	beforeID, limit := parseTicketMessagePageParams(c)
	messages, err := model.ListTicketMessages(ticket.Id, false, beforeID, limit)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, ticketMessagesToOwnerResponse(messages))
}

// ReplyMyTicket posts a public reply to the caller's own ticket. Regular
// users can never post an internal note; Internal is silently ignored rather
// than accepted, so a strict client omitting it entirely still works.
func ReplyMyTicket(c *gin.Context) {
	userID := c.GetInt("id")
	if _, err := model.GetOwnedTicket(c.Param("public_id"), userID); err != nil {
		handleTicketModelError(c, err)
		return
	}
	var req dto.ReplyTicketRequest
	if err := common.UnmarshalBodyReusableStrict(c, &req); err != nil {
		common.ApiErrorMsg(c, "invalid request: "+err.Error())
		return
	}
	if err := validateTicketAttachmentUrlsBelongToCaller(req.AttachmentUrls, userID); err != nil {
		common.ApiErrorMsg(c, err.Error())
		return
	}
	ticket, message, err := model.ReplyToTicket(c.Param("public_id"), userID, model.TicketAuthorKindUser, model.TicketVisibilityPublic, req.Body, req.ClientRequestId, req.AttachmentUrls...)
	if err != nil {
		handleTicketModelError(c, err)
		return
	}
	common.ApiSuccess(c, gin.H{"ticket": ticketToOwnerResponse(ticket), "message": ticketMessageToOwnerResponse(message)})
}

// MarkMyTicketRead advances the caller's own read cursor.
func MarkMyTicketRead(c *gin.Context) {
	userID := c.GetInt("id")
	if _, err := model.GetOwnedTicket(c.Param("public_id"), userID); err != nil {
		handleTicketModelError(c, err)
		return
	}
	if err := model.MarkTicketRead(c.Param("public_id"), userID, false); err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, nil)
}

// ResolveMyTicket lets the ticket's own owner resolve it.
func ResolveMyTicket(c *gin.Context) {
	userID := c.GetInt("id")
	if _, err := model.GetOwnedTicket(c.Param("public_id"), userID); err != nil {
		handleTicketModelError(c, err)
		return
	}
	var req dto.TicketVersionRequest
	if err := common.UnmarshalBodyReusableStrict(c, &req); err != nil {
		common.ApiErrorMsg(c, "invalid request: "+err.Error())
		return
	}
	ticket, err := model.ResolveTicket(c.Param("public_id"), model.TicketAuthorKindUser, req.ExpectedVersion)
	if err != nil {
		handleTicketModelError(c, err)
		return
	}
	common.ApiSuccess(c, ticketToOwnerResponse(ticket))
}

// ReopenMyTicket lets the ticket's own owner reopen it.
func ReopenMyTicket(c *gin.Context) {
	userID := c.GetInt("id")
	if _, err := model.GetOwnedTicket(c.Param("public_id"), userID); err != nil {
		handleTicketModelError(c, err)
		return
	}
	var req dto.TicketVersionRequest
	if err := common.UnmarshalBodyReusableStrict(c, &req); err != nil {
		common.ApiErrorMsg(c, "invalid request: "+err.Error())
		return
	}
	ticket, err := model.ReopenTicket(c.Param("public_id"), model.TicketAuthorKindUser, req.ExpectedVersion)
	if err != nil {
		handleTicketModelError(c, err)
		return
	}
	common.ApiSuccess(c, ticketToOwnerResponse(ticket))
}

// GetMyTicketUnreadCount returns how many of the caller's own tickets have an
// unread staff reply.
func GetMyTicketUnreadCount(c *gin.Context) {
	userID := c.GetInt("id")
	count, err := model.CountTicketsWithUnreadForUser(userID)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, gin.H{"unread_ticket_count": count})
}
