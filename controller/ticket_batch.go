package controller

import (
	"fmt"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/dto"
	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
)

// ticketBatchMaxItems bounds one bulk request. Each item still runs its own
// independent DB transaction (see the "why not one big UPDATE" note on
// BulkResolveTicketsAdmin below), so an unbounded batch would let one request
// hold open an unbounded number of sequential transactions.
const ticketBatchMaxItems = 200

func validateTicketBatchSize(n int) error {
	if n == 0 {
		return fmt.Errorf("items must not be empty")
	}
	if n > ticketBatchMaxItems {
		return fmt.Errorf("a batch may contain at most %d items", ticketBatchMaxItems)
	}
	return nil
}

// BulkResolveTicketsAdmin resolves every item independently, one
// model.ResolveTicket call (its own CAS-guarded transaction) per item — never
// a single UPDATE ... WHERE id IN (...). Ticket has a Version column that
// every single-ticket mutator respects; a bulk UPDATE bypassing it would
// silently overwrite concurrent changes the caller's expected_version never
// saw. One item's failure (not found, version conflict, validation) never
// aborts or rolls back the others.
func BulkResolveTicketsAdmin(c *gin.Context) {
	var req dto.BulkResolveTicketsRequest
	if err := common.UnmarshalBodyReusableStrict(c, &req); err != nil {
		common.ApiErrorMsg(c, "invalid request: "+err.Error())
		return
	}
	if err := validateTicketBatchSize(len(req.Items)); err != nil {
		common.ApiErrorMsg(c, err.Error())
		return
	}
	results := make([]dto.TicketBatchResult, 0, len(req.Items))
	for _, item := range req.Items {
		_, err := model.ResolveTicket(item.PublicId, model.TicketAuthorKindStaff, item.ExpectedVersion)
		results = append(results, ticketBatchResultFor(item.PublicId, err == nil, err))
	}
	recordManageAudit(c, "ticket.bulk_resolve", map[string]interface{}{"count": len(req.Items)})
	common.ApiSuccess(c, dto.BulkTicketResponse{Results: results})
}

// BulkAssignTicketsAdmin assigns every item to the same AssigneeUserId, each
// via its own model.AssignTicket CAS call — see BulkResolveTicketsAdmin for
// why this is never a single bulk UPDATE.
func BulkAssignTicketsAdmin(c *gin.Context) {
	var req dto.BulkAssignTicketsRequest
	if err := common.UnmarshalBodyReusableStrict(c, &req); err != nil {
		common.ApiErrorMsg(c, "invalid request: "+err.Error())
		return
	}
	if err := validateTicketBatchSize(len(req.Items)); err != nil {
		common.ApiErrorMsg(c, err.Error())
		return
	}
	if err := validateTicketAssignee(req.AssigneeUserId); err != nil {
		common.ApiErrorMsg(c, err.Error())
		return
	}
	results := make([]dto.TicketBatchResult, 0, len(req.Items))
	for _, item := range req.Items {
		_, err := model.AssignTicket(item.PublicId, req.AssigneeUserId, item.ExpectedVersion)
		results = append(results, ticketBatchResultFor(item.PublicId, err == nil, err))
	}
	recordManageAudit(c, "ticket.bulk_assign", map[string]interface{}{
		"count":            len(req.Items),
		"assignee_user_id": req.AssigneeUserId,
	})
	common.ApiSuccess(c, dto.BulkTicketResponse{Results: results})
}

// BulkTagTicketsAdmin adds Tags to every ticket in PublicIds. Tagging is not
// CAS-guarded (model.AddTicketTags never touches Ticket.Version), so items
// here carry no expected_version.
func BulkTagTicketsAdmin(c *gin.Context) {
	var req dto.BulkTagTicketsRequest
	if err := common.UnmarshalBodyReusableStrict(c, &req); err != nil {
		common.ApiErrorMsg(c, "invalid request: "+err.Error())
		return
	}
	if err := validateTicketBatchSize(len(req.PublicIds)); err != nil {
		common.ApiErrorMsg(c, err.Error())
		return
	}
	results := make([]dto.TicketBatchResult, 0, len(req.PublicIds))
	for _, publicID := range req.PublicIds {
		ticket, err := model.GetTicketByPublicID(publicID)
		if err != nil {
			results = append(results, ticketBatchResultFor(publicID, false, err))
			continue
		}
		err = model.AddTicketTags(ticket.Id, req.Tags)
		results = append(results, ticketBatchResultFor(publicID, err == nil, err))
	}
	recordManageAudit(c, "ticket.bulk_tag", map[string]interface{}{
		"count": len(req.PublicIds),
		"tags":  req.Tags,
	})
	common.ApiSuccess(c, dto.BulkTicketResponse{Results: results})
}

// ticketBatchResultFor turns one item's outcome into its TicketBatchResult
// row, applying the same error classification handleTicketModelError uses
// for a single-ticket response.
func ticketBatchResultFor(publicID string, success bool, err error) dto.TicketBatchResult {
	if success {
		return dto.TicketBatchResult{PublicId: publicID, Success: true}
	}
	message, versionConflict := classifyTicketError(err)
	return dto.TicketBatchResult{PublicId: publicID, Success: false, Error: message, VersionConflict: versionConflict}
}
