package controller

import (
	"net/http"
	"testing"

	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

func TestAddTicketTagsAdminAddsAndReturnsFullTagList(t *testing.T) {
	setupTicketControllerTest(t)
	ticket, _, err := model.CreateTicket(7, 7, model.TicketInitiatedByUser, model.TicketCategoryGeneral, model.TicketPriorityNormal, "s", "b", "create-1")
	require.NoError(t, err)
	require.NoError(t, model.AddTicketTags(ticket.Id, []string{"billing"}))

	ctx, recorder := newTicketTestContext(t, http.MethodPost, "/api/admin/tickets/"+ticket.PublicId+"/tags", 100, map[string]any{
		"tags": []string{"Bug", " urgent "},
	})
	setTicketPublicIDParam(ctx, ticket.PublicId)
	AddTicketTagsAdmin(ctx)

	response := decodeJSONResponse(t, recorder)
	require.Equal(t, true, response["success"], response["message"])
	data, ok := response["data"].(map[string]any)
	require.True(t, ok)
	tags, ok := data["tags"].([]any)
	require.True(t, ok)
	require.ElementsMatch(t, []any{"billing", "bug", "urgent"}, tags)
}

func TestRemoveTicketTagAdminIsNoOpWhenAbsent(t *testing.T) {
	setupTicketControllerTest(t)
	ticket, _, err := model.CreateTicket(7, 7, model.TicketInitiatedByUser, model.TicketCategoryGeneral, model.TicketPriorityNormal, "s", "b", "create-1")
	require.NoError(t, err)

	ctx, recorder := newTicketTestContext(t, http.MethodDelete, "/api/admin/tickets/"+ticket.PublicId+"/tags/never-added", 100, nil)
	setTicketPublicIDParam(ctx, ticket.PublicId)
	ctx.Params = append(ctx.Params, gin.Param{Key: "tag", Value: "never-added"})
	RemoveTicketTagAdmin(ctx)

	response := decodeJSONResponse(t, recorder)
	require.Equal(t, true, response["success"], response["message"])
}
