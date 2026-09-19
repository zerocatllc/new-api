package controller

import (
	"errors"
	"strconv"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/dto"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service/authz"
	"github.com/gin-gonic/gin"
)

// AdminCreateTicket lets staff open a ticket on a user's behalf. Unlike the
// user-facing CreateTicket, it is not gated on ticket_setting.Enabled(): that
// toggle stops new public intake, not staff logging an out-of-band case
// (e.g. a phone call) while the feature is temporarily disabled.
func AdminCreateTicket(c *gin.Context) {
	var req dto.AdminCreateTicketRequest
	if err := common.UnmarshalBodyReusableStrict(c, &req); err != nil {
		common.ApiErrorMsg(c, "invalid request: "+err.Error())
		return
	}
	if req.UserId <= 0 {
		common.ApiErrorMsg(c, "user_id is required")
		return
	}
	if _, err := model.GetUserById(req.UserId, false); err != nil {
		common.ApiErrorMsg(c, "target user does not exist")
		return
	}
	// Attachments are uploaded by the staff member calling this endpoint (the
	// upload handler scopes the storage key by the authenticated caller), not
	// by req.UserId — the ticket's target owner never authenticates here.
	staffUserID := c.GetInt("id")
	if err := validateTicketAttachmentUrlsBelongToCaller(req.AttachmentUrls, staffUserID); err != nil {
		common.ApiErrorMsg(c, err.Error())
		return
	}
	// req.UserId owns the ticket; staffUserID is the actor who actually wrote
	// this first message -- see model.CreateTicket's doc comment for why
	// collapsing the two broke the customer's read cursor and notification.
	ticket, _, err := model.CreateTicket(req.UserId, staffUserID, model.TicketInitiatedByStaff, req.Category, req.Priority, req.Subject, req.Body, req.ClientRequestId, req.AttachmentUrls...)
	if err != nil {
		common.ApiErrorMsg(c, err.Error())
		return
	}
	recordManageAudit(c, "ticket.create", map[string]interface{}{
		"ticket_public_id": ticket.PublicId,
		"target_user_id":   req.UserId,
	})
	common.ApiSuccess(c, ticketToResponse(ticket))
}

// adminTicketVisibilityScope is fixed, not caller-controlled: every route
// that reaches this filter already requires authz.TicketRead, which is the
// permission that authorizes seeing internal notes at all.
var adminTicketVisibilityScope = []string{model.TicketVisibilityPublic, model.TicketVisibilityInternal}

func parseTicketAdminListFilter(c *gin.Context) (model.TicketListFilter, error) {
	filter := parseTicketListFilter(c)
	filter.VisibilityScope = adminTicketVisibilityScope
	if raw := c.Query("assigned_to"); raw != "" {
		if id, err := strconv.Atoi(raw); err == nil {
			filter.AssignedTo = &id
		}
	}
	rawTags := append(c.QueryArray("tags"), c.QueryArray("tags[]")...)
	seen := make(map[string]struct{})
	for _, raw := range rawTags {
		for _, value := range strings.Split(raw, ",") {
			tag := strings.ToLower(strings.TrimSpace(value))
			if tag == "" {
				continue
			}
			if err := model.ValidateTicketTag(tag); err != nil {
				return model.TicketListFilter{}, err
			}
			if _, exists := seen[tag]; exists {
				continue
			}
			seen[tag] = struct{}{}
			filter.Tags = append(filter.Tags, tag)
		}
	}
	return filter, nil
}

// GetTicketStatsAdmin returns ticket counts by status across every ticket.
func GetTicketStatsAdmin(c *gin.Context) {
	byStatus, err := model.CountTicketsByStatus(nil)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	var total int64
	for _, count := range byStatus {
		total += count
	}
	queues, err := model.CountTicketQueues(c.GetInt("id"))
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, gin.H{"total": total, "by_status": byStatus, "queues": queues})
}

// ListAllTickets returns one filtered page across every ticket, enriched with
// each row's unread count (scoped to the calling staff member's own read
// cursor) and the requesting user's username/display name.
func ListAllTickets(c *gin.Context) {
	staffUserID := c.GetInt("id")
	pageInfo := common.GetPageQuery(c)
	filter, err := parseTicketAdminListFilter(c)
	if err != nil {
		common.ApiErrorMsg(c, err.Error())
		return
	}
	tickets, total, err := model.ListTicketsForAdmin(filter, pageInfo.GetStartIdx(), pageInfo.GetPageSize())
	if err != nil {
		common.ApiError(c, err)
		return
	}

	ticketIDs := make([]int64, 0, len(tickets))
	userIDs := make([]int, 0, len(tickets))
	for i := range tickets {
		ticketIDs = append(ticketIDs, tickets[i].Id)
		userIDs = append(userIDs, tickets[i].UserId)
	}
	unreadByTicket, err := model.CountUnreadForTickets(ticketIDs, staffUserID)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	namesByUser, err := model.GetUserNamesByIDs(userIDs)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	tagsByTicket, err := model.ListTicketTagsByTicketIDs(ticketIDs)
	if err != nil {
		common.ApiError(c, err)
		return
	}

	items := make([]dto.TicketResponse, 0, len(tickets))
	for i := range tickets {
		item := ticketToResponse(&tickets[i])
		unread := unreadByTicket[tickets[i].Id]
		item.UnreadCount = &unread
		if info, ok := namesByUser[tickets[i].UserId]; ok {
			item.Username = info.Username
			item.DisplayName = info.DisplayName
		}
		item.Tags = tagsByTicket[tickets[i].Id]
		items = append(items, item)
	}
	common.ApiSuccess(c, gin.H{
		"items":     items,
		"total":     total,
		"page":      pageInfo.GetPage(),
		"page_size": pageInfo.GetPageSize(),
	})
}

// GetTicketAdmin returns any ticket by public id, regardless of owner. When
// the caller also holds authz.TicketViewUserProfile, the response is
// enriched with the requester's account snapshot for support investigation.
func GetTicketAdmin(c *gin.Context) {
	ticket, err := model.GetTicketByPublicID(c.Param("public_id"))
	if err != nil {
		handleTicketModelError(c, err)
		return
	}
	response := ticketToResponse(ticket)
	tags, err := model.ListTicketTags(ticket.Id)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	response.Tags = tags
	if authz.Can(c.GetInt("id"), c.GetInt("role"), authz.TicketViewUserProfile) {
		if requester, err := model.GetUserById(ticket.UserId, false); err == nil {
			response.UserProfile = &dto.TicketUserProfile{
				Quota:  requester.Quota,
				Group:  requester.Group,
				Role:   requester.Role,
				Status: requester.Status,
			}
		}
	}
	common.ApiSuccess(c, response)
}

// ListTicketMessagesAdmin returns a full (including internal notes) keyset
// page of a ticket's messages.
func ListTicketMessagesAdmin(c *gin.Context) {
	ticket, err := model.GetTicketByPublicID(c.Param("public_id"))
	if err != nil {
		handleTicketModelError(c, err)
		return
	}
	beforeID, limit := parseTicketMessagePageParams(c)
	messages, err := model.ListTicketMessages(ticket.Id, true, beforeID, limit)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, ticketMessagesToResponse(messages))
}

// ReplyTicketAdmin posts a staff reply — public or, when Internal is set, an
// internal note invisible to the user.
func ReplyTicketAdmin(c *gin.Context) {
	var req dto.ReplyTicketRequest
	if err := common.UnmarshalBodyReusableStrict(c, &req); err != nil {
		common.ApiErrorMsg(c, "invalid request: "+err.Error())
		return
	}
	staffUserID := c.GetInt("id")
	if err := validateTicketAttachmentUrlsBelongToCaller(req.AttachmentUrls, staffUserID); err != nil {
		common.ApiErrorMsg(c, err.Error())
		return
	}
	visibility := model.TicketVisibilityPublic
	if req.Internal {
		visibility = model.TicketVisibilityInternal
	}
	ticket, message, err := model.ReplyToTicket(c.Param("public_id"), staffUserID, model.TicketAuthorKindStaff, visibility, req.Body, req.ClientRequestId, req.AttachmentUrls...)
	if err != nil {
		handleTicketModelError(c, err)
		return
	}
	recordManageAudit(c, "ticket.reply", map[string]interface{}{
		"ticket_public_id": ticket.PublicId,
		"internal":         req.Internal,
	})
	common.ApiSuccess(c, gin.H{"ticket": ticketToResponse(ticket), "message": ticketMessageToResponse(message)})
}

// MarkTicketReadAdmin advances the calling staff member's own read cursor.
func MarkTicketReadAdmin(c *gin.Context) {
	staffUserID := c.GetInt("id")
	if err := model.MarkTicketRead(c.Param("public_id"), staffUserID, true); err != nil {
		handleTicketModelError(c, err)
		return
	}
	common.ApiSuccess(c, nil)
}

// ResolveTicketAdmin lets staff resolve any ticket.
func ResolveTicketAdmin(c *gin.Context) {
	var req dto.TicketVersionRequest
	if err := common.UnmarshalBodyReusableStrict(c, &req); err != nil {
		common.ApiErrorMsg(c, "invalid request: "+err.Error())
		return
	}
	ticket, err := model.ResolveTicket(c.Param("public_id"), model.TicketAuthorKindStaff, req.ExpectedVersion)
	if err != nil {
		handleTicketModelError(c, err)
		return
	}
	recordManageAudit(c, "ticket.resolve", map[string]interface{}{"ticket_public_id": ticket.PublicId})
	common.ApiSuccess(c, ticketToResponse(ticket))
}

// ReopenTicketAdmin lets staff reopen any ticket.
func ReopenTicketAdmin(c *gin.Context) {
	var req dto.TicketVersionRequest
	if err := common.UnmarshalBodyReusableStrict(c, &req); err != nil {
		common.ApiErrorMsg(c, "invalid request: "+err.Error())
		return
	}
	ticket, err := model.ReopenTicket(c.Param("public_id"), model.TicketAuthorKindStaff, req.ExpectedVersion)
	if err != nil {
		handleTicketModelError(c, err)
		return
	}
	recordManageAudit(c, "ticket.reopen", map[string]interface{}{"ticket_public_id": ticket.PublicId})
	common.ApiSuccess(c, ticketToResponse(ticket))
}

// validateTicketAssignee rejects assigning a ticket to a nil-adjacent id: the
// target must be a real, enabled staff account (role >= common.RoleAdminUser,
// the same floor middleware.AdminAuth() requires to reach these routes at
// all), not an arbitrary integer, a disabled account, or a regular customer.
// Clearing the assignee (assigneeUserID == nil) is always allowed.
func validateTicketAssignee(assigneeUserID *int) error {
	if assigneeUserID == nil {
		return nil
	}
	user, err := model.GetUserById(*assigneeUserID, false)
	if err != nil {
		return errors.New("assignee_user_id does not refer to an existing user")
	}
	if user.Status != common.UserStatusEnabled {
		return errors.New("assignee_user_id refers to a disabled user")
	}
	if user.Role < common.RoleAdminUser {
		return errors.New("assignee_user_id does not refer to a staff account that can handle tickets")
	}
	return nil
}

// AssignTicketAdmin sets or clears a ticket's assignee.
func AssignTicketAdmin(c *gin.Context) {
	var req dto.AssignTicketRequest
	if err := common.UnmarshalBodyReusableStrict(c, &req); err != nil {
		common.ApiErrorMsg(c, "invalid request: "+err.Error())
		return
	}
	if err := validateTicketAssignee(req.AssigneeUserId); err != nil {
		common.ApiErrorMsg(c, err.Error())
		return
	}
	ticket, err := model.AssignTicket(c.Param("public_id"), req.AssigneeUserId, req.ExpectedVersion)
	if err != nil {
		handleTicketModelError(c, err)
		return
	}
	recordManageAudit(c, "ticket.assign", map[string]interface{}{
		"ticket_public_id": ticket.PublicId,
		"assignee_user_id": req.AssigneeUserId,
	})
	common.ApiSuccess(c, ticketToResponse(ticket))
}

// GetTicketUnreadCountAdmin returns how many tickets have activity the
// calling staff member hasn't seen yet.
func GetTicketUnreadCountAdmin(c *gin.Context) {
	staffUserID := c.GetInt("id")
	count, err := model.CountTicketsWithUnreadForStaff(staffUserID)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, gin.H{"unread_ticket_count": count})
}

// DeleteTicketAdmin moves one ticket into recoverable trash using the
// caller's last-seen version. Messages, attachments, and audit records remain.
func DeleteTicketAdmin(c *gin.Context) {
	var req dto.TicketVersionRequest
	if err := common.UnmarshalBodyReusableStrict(c, &req); err != nil {
		common.ApiErrorMsg(c, "invalid request: "+err.Error())
		return
	}
	ticket, err := model.SoftDeleteTicket(c.Param("public_id"), c.GetInt("id"), req.ExpectedVersion)
	if err != nil {
		handleTicketModelError(c, err)
		return
	}
	recordManageAudit(c, "ticket.delete", map[string]interface{}{
		"ticket_public_id": ticket.PublicId,
	})
	common.ApiSuccess(c, ticketToResponse(ticket))
}

// ListDeletedTicketsAdmin returns the recoverable trash, separate from the
// normal management list and statistics.
func ListDeletedTicketsAdmin(c *gin.Context) {
	pageInfo := common.GetPageQuery(c)
	filter := parseTicketListFilter(c)
	tickets, total, err := model.ListDeletedTickets(filter, pageInfo.GetStartIdx(), pageInfo.GetPageSize())
	if err != nil {
		common.ApiError(c, err)
		return
	}
	items := make([]dto.TicketResponse, 0, len(tickets))
	for i := range tickets {
		items = append(items, ticketToResponse(&tickets[i]))
	}
	common.ApiSuccess(c, gin.H{
		"items":     items,
		"total":     total,
		"page":      pageInfo.GetPage(),
		"page_size": pageInfo.GetPageSize(),
	})
}

// RestoreTicketAdmin returns one trashed ticket to normal visibility using
// the trash row's current version.
func RestoreTicketAdmin(c *gin.Context) {
	var req dto.TicketVersionRequest
	if err := common.UnmarshalBodyReusableStrict(c, &req); err != nil {
		common.ApiErrorMsg(c, "invalid request: "+err.Error())
		return
	}
	ticket, err := model.RestoreTicket(c.Param("public_id"), req.ExpectedVersion)
	if err != nil {
		handleTicketModelError(c, err)
		return
	}
	recordManageAudit(c, "ticket.restore", map[string]interface{}{
		"ticket_public_id": ticket.PublicId,
	})
	common.ApiSuccess(c, ticketToResponse(ticket))
}
