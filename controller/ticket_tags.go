package controller

import (
	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/dto"
	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
)

// AddTicketTagsAdmin adds one or more tags to a ticket and responds with the
// ticket's full current tag list (not just the ones just added), so the
// caller never needs a follow-up read to reconcile state.
func AddTicketTagsAdmin(c *gin.Context) {
	var req dto.AddTicketTagsRequest
	if err := common.UnmarshalBodyReusableStrict(c, &req); err != nil {
		common.ApiErrorMsg(c, "invalid request: "+err.Error())
		return
	}
	ticket, err := model.GetTicketByPublicID(c.Param("public_id"))
	if err != nil {
		handleTicketModelError(c, err)
		return
	}
	if err := model.AddTicketTags(ticket.Id, req.Tags); err != nil {
		common.ApiErrorMsg(c, err.Error())
		return
	}
	tags, err := model.ListTicketTags(ticket.Id)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	recordManageAudit(c, "ticket.tags.add", map[string]interface{}{
		"ticket_public_id": ticket.PublicId,
		"tags":             req.Tags,
	})
	response := ticketToResponse(ticket)
	response.Tags = tags
	common.ApiSuccess(c, response)
}

// RemoveTicketTagAdmin removes one tag from a ticket. Removing a tag that
// isn't present is not an error (see model.RemoveTicketTag).
func RemoveTicketTagAdmin(c *gin.Context) {
	ticket, err := model.GetTicketByPublicID(c.Param("public_id"))
	if err != nil {
		handleTicketModelError(c, err)
		return
	}
	if err := model.RemoveTicketTag(ticket.Id, c.Param("tag")); err != nil {
		common.ApiError(c, err)
		return
	}
	tags, err := model.ListTicketTags(ticket.Id)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	recordManageAudit(c, "ticket.tags.remove", map[string]interface{}{
		"ticket_public_id": ticket.PublicId,
		"tag":              c.Param("tag"),
	})
	response := ticketToResponse(ticket)
	response.Tags = tags
	common.ApiSuccess(c, response)
}
