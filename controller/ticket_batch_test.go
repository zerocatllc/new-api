package controller

import (
	"net/http"
	"strconv"
	"testing"

	"github.com/QuantumNous/new-api/dto"
	"github.com/QuantumNous/new-api/model"
	"github.com/stretchr/testify/require"
)

func createThreeTicketsForBatch(t *testing.T) []*model.Ticket {
	t.Helper()
	tickets := make([]*model.Ticket, 0, 3)
	for i := 0; i < 3; i++ {
		ticket, _, err := model.CreateTicket(7, 7, model.TicketInitiatedByUser, model.TicketCategoryGeneral, model.TicketPriorityNormal,
			"s", "b", "create-batch-"+strconv.Itoa(i))
		require.NoError(t, err)
		tickets = append(tickets, ticket)
	}
	return tickets
}

// TestBulkResolveTicketsPartialFailureDoesNotAbortOthers proves the batch
// endpoint runs each item as its own independent CAS transaction: a stale
// expected_version on one item must not roll back or block the others,
// unlike a single "UPDATE ... WHERE id IN (...)" would risk.
func TestBulkResolveTicketsPartialFailureDoesNotAbortOthers(t *testing.T) {
	setupTicketControllerTest(t)
	// CreateTicket's client_request_id must be unique per ticket, not shared.
	ticketA, _, err := model.CreateTicket(7, 7, model.TicketInitiatedByUser, model.TicketCategoryGeneral, model.TicketPriorityNormal, "s", "b", "create-a")
	require.NoError(t, err)
	ticketB, _, err := model.CreateTicket(7, 7, model.TicketInitiatedByUser, model.TicketCategoryGeneral, model.TicketPriorityNormal, "s", "b", "create-b")
	require.NoError(t, err)
	ticketC, _, err := model.CreateTicket(7, 7, model.TicketInitiatedByUser, model.TicketCategoryGeneral, model.TicketPriorityNormal, "s", "b", "create-c")
	require.NoError(t, err)

	ctx, recorder := newTicketTestContext(t, http.MethodPost, "/api/admin/tickets/bulk/resolve", 100, dto.BulkResolveTicketsRequest{
		Items: []dto.TicketBatchItem{
			{PublicId: ticketA.PublicId, ExpectedVersion: ticketA.Version},
			{PublicId: ticketB.PublicId, ExpectedVersion: ticketB.Version + 99}, // stale on purpose
			{PublicId: ticketC.PublicId, ExpectedVersion: ticketC.Version},
		},
	})
	BulkResolveTicketsAdmin(ctx)

	response := decodeJSONResponse(t, recorder)
	require.Equal(t, true, response["success"], response["message"])
	data := response["data"].(map[string]any)
	results := data["results"].([]any)
	require.Len(t, results, 3)

	byPublicID := map[string]map[string]any{}
	for _, raw := range results {
		row := raw.(map[string]any)
		byPublicID[row["public_id"].(string)] = row
	}
	require.Equal(t, true, byPublicID[ticketA.PublicId]["success"])
	require.Equal(t, false, byPublicID[ticketB.PublicId]["success"])
	require.Equal(t, true, byPublicID[ticketB.PublicId]["version_conflict"])
	require.Equal(t, true, byPublicID[ticketC.PublicId]["success"])

	reloadedA, err := model.GetTicketByPublicID(ticketA.PublicId)
	require.NoError(t, err)
	require.Equal(t, model.TicketStatusResolved, reloadedA.Status)
	reloadedB, err := model.GetTicketByPublicID(ticketB.PublicId)
	require.NoError(t, err)
	require.Equal(t, model.TicketStatusOpen, reloadedB.Status, "the stale item must not have been resolved")
	reloadedC, err := model.GetTicketByPublicID(ticketC.PublicId)
	require.NoError(t, err)
	require.Equal(t, model.TicketStatusResolved, reloadedC.Status)
}

func TestBulkAssignTicketsRejectsEmptyAndOversizedBatch(t *testing.T) {
	setupTicketControllerTest(t)

	ctx, recorder := newTicketTestContext(t, http.MethodPost, "/api/admin/tickets/bulk/assign", 100, dto.BulkAssignTicketsRequest{
		Items: nil,
	})
	BulkAssignTicketsAdmin(ctx)
	response := decodeJSONResponse(t, recorder)
	require.Equal(t, false, response["success"])

	oversized := make([]dto.TicketBatchItem, ticketBatchMaxItems+1)
	for i := range oversized {
		oversized[i] = dto.TicketBatchItem{PublicId: "does-not-matter", ExpectedVersion: 1}
	}
	ctx, recorder = newTicketTestContext(t, http.MethodPost, "/api/admin/tickets/bulk/assign", 100, dto.BulkAssignTicketsRequest{
		Items: oversized,
	})
	BulkAssignTicketsAdmin(ctx)
	response = decodeJSONResponse(t, recorder)
	require.Equal(t, false, response["success"])
	require.Contains(t, response["message"], "at most")
}

func TestBulkTagTicketsAdminTagsEveryTicketIndependently(t *testing.T) {
	setupTicketControllerTest(t)
	tickets := createThreeTicketsForBatch(t)

	ctx, recorder := newTicketTestContext(t, http.MethodPost, "/api/admin/tickets/bulk/tags", 100, dto.BulkTagTicketsRequest{
		PublicIds: []string{tickets[0].PublicId, "nonexistent-public-id", tickets[2].PublicId},
		Tags:      []string{"bug"},
	})
	BulkTagTicketsAdmin(ctx)

	response := decodeJSONResponse(t, recorder)
	require.Equal(t, true, response["success"], response["message"])
	data := response["data"].(map[string]any)
	results := data["results"].([]any)
	require.Len(t, results, 3)

	tagsA, err := model.ListTicketTags(tickets[0].Id)
	require.NoError(t, err)
	require.Equal(t, []string{"bug"}, tagsA)
	tagsB, err := model.ListTicketTags(tickets[1].Id)
	require.NoError(t, err)
	require.Empty(t, tagsB, "a ticket not named in the batch must be untouched")
	tagsC, err := model.ListTicketTags(tickets[2].Id)
	require.NoError(t, err)
	require.Equal(t, []string{"bug"}, tagsC)
}
