package controller

import (
	"net/http"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting/ticket_setting"
	"github.com/stretchr/testify/require"
)

// TestAdminCreateTicketRejectsAttachmentUrlNotUploadedByStaffCaller proves the
// write-time provenance check binds to the authenticated STAFF caller (100),
// never to the ticket's target owner (req.user_id=7) who never authenticates
// in this admin-on-behalf-of flow and therefore could never have uploaded
// anything under their own id.
func TestAdminCreateTicketRejectsAttachmentUrlNotUploadedByStaffCaller(t *testing.T) {
	setupTicketControllerTest(t)
	require.NoError(t, model.DB.Create(&model.User{Id: 7, Username: "target7", Status: common.UserStatusEnabled}).Error)
	applyTestStorageBaseURL(t, "https://cdn.example.com")
	recordReadyTicketAttachmentForTest(t, "tickets/7/uploaded-by-target-user.png", 7)

	ctx, recorder := newTicketTestContext(t, http.MethodPost, "/api/admin/tickets", 100, map[string]any{
		"user_id": 7, "category": "general", "priority": "normal", "subject": "phone case", "body": "logged by staff", "client_request_id": "admin-1",
		"attachment_urls": []string{"https://cdn.example.com/tickets/7/uploaded-by-target-user.png"},
	})
	AdminCreateTicket(ctx)

	response := decodeJSONResponse(t, recorder)
	require.Equal(t, false, response["success"], "an attachment uploaded by the ticket's target user, not the staff caller, must be rejected")
	require.Contains(t, response["message"], "not uploaded by you")
}

func TestAdminCreateTicketAllowsAttachmentUrlUploadedByStaffCaller(t *testing.T) {
	setupTicketControllerTest(t)
	require.NoError(t, model.DB.Create(&model.User{Id: 7, Username: "target7", Status: common.UserStatusEnabled}).Error)
	applyTestStorageBaseURL(t, "https://cdn.example.com")
	recordReadyTicketAttachmentForTest(t, "tickets/100/uploaded-by-staff.png", 100)

	ctx, recorder := newTicketTestContext(t, http.MethodPost, "/api/admin/tickets", 100, map[string]any{
		"user_id": 7, "category": "general", "priority": "normal", "subject": "phone case", "body": "logged by staff", "client_request_id": "admin-1",
		"attachment_urls": []string{"https://cdn.example.com/tickets/100/uploaded-by-staff.png"},
	})
	AdminCreateTicket(ctx)

	response := decodeJSONResponse(t, recorder)
	require.Equal(t, true, response["success"], response["message"])
}

func TestReplyTicketAdminRejectsAttachmentUrlNotUploadedByStaffCaller(t *testing.T) {
	setupTicketControllerTest(t)
	applyTestStorageBaseURL(t, "https://cdn.example.com")
	ticket, _, err := model.CreateTicket(7, 7, model.TicketInitiatedByUser, model.TicketCategoryGeneral, model.TicketPriorityNormal, "s", "b", "create-1")
	require.NoError(t, err)
	recordReadyTicketAttachmentForTest(t, "tickets/7/uploaded-by-target-user.png", 7)

	ctx, recorder := newTicketTestContext(t, http.MethodPost, "/api/admin/tickets/"+ticket.PublicId+"/messages", 100, map[string]any{
		"body": "reply with attachment", "client_request_id": "reply-1",
		"attachment_urls": []string{"https://cdn.example.com/tickets/7/uploaded-by-target-user.png"},
	})
	setTicketPublicIDParam(ctx, ticket.PublicId)
	ReplyTicketAdmin(ctx)

	response := decodeJSONResponse(t, recorder)
	require.Equal(t, false, response["success"], "an attachment uploaded by the ticket owner, not the replying staff caller, must be rejected")
	require.Contains(t, response["message"], "not uploaded by you")
}

func TestAdminCreateTicketOnUsersBehalf(t *testing.T) {
	setupTicketControllerTest(t)
	require.NoError(t, model.DB.Create(&model.User{Id: 7, Username: "target7", Status: common.UserStatusEnabled}).Error)

	ctx, recorder := newTicketTestContext(t, http.MethodPost, "/api/admin/tickets", 100, map[string]any{
		"user_id": 7, "category": "general", "priority": "normal", "subject": "phone case", "body": "logged by staff", "client_request_id": "admin-1",
	})
	AdminCreateTicket(ctx)

	response := decodeJSONResponse(t, recorder)
	require.Equal(t, true, response["success"], response["message"])

	var ticket model.Ticket
	require.NoError(t, model.DB.Where("user_id = ?", 7).First(&ticket).Error)
	require.Equal(t, model.TicketInitiatedByStaff, ticket.InitiatedBy)
}

func TestAdminCreateTicketWorksEvenWhenTicketSystemDisabled(t *testing.T) {
	setupTicketControllerTest(t)
	require.NoError(t, model.DB.Create(&model.User{Id: 7, Username: "target7", Status: common.UserStatusEnabled}).Error)
	ticket_setting.ApplySavedSettings(ticket_setting.TicketSettings{Version: 0, Enabled: false})

	ctx, recorder := newTicketTestContext(t, http.MethodPost, "/api/admin/tickets", 100, map[string]any{
		"user_id": 7, "category": "general", "priority": "normal", "subject": "phone case", "body": "logged by staff", "client_request_id": "admin-1",
	})
	AdminCreateTicket(ctx)

	response := decodeJSONResponse(t, recorder)
	require.Equal(t, true, response["success"], response["message"])
}

func TestDeleteAndRestoreTicketAdminRequireCurrentVersion(t *testing.T) {
	setupTicketControllerTest(t)
	ticket, _, err := model.CreateTicket(7, 7, model.TicketInitiatedByUser, model.TicketCategoryGeneral, model.TicketPriorityNormal, "subject", "body", "create-1")
	require.NoError(t, err)

	staleCtx, staleRecorder := newTicketTestContext(t, http.MethodDelete, "/api/admin/tickets/"+ticket.PublicId, 1, map[string]any{
		"expected_version": ticket.Version - 1,
	})
	setTicketPublicIDParam(staleCtx, ticket.PublicId)
	DeleteTicketAdmin(staleCtx)
	staleResponse := decodeJSONResponse(t, staleRecorder)
	require.Equal(t, false, staleResponse["success"])
	require.Equal(t, true, staleResponse["data"].(map[string]any)["version_conflict"])

	deleteCtx, deleteRecorder := newTicketTestContext(t, http.MethodDelete, "/api/admin/tickets/"+ticket.PublicId, 1, map[string]any{
		"expected_version": ticket.Version,
	})
	setTicketPublicIDParam(deleteCtx, ticket.PublicId)
	DeleteTicketAdmin(deleteCtx)
	deleteResponse := decodeJSONResponse(t, deleteRecorder)
	require.Equal(t, true, deleteResponse["success"], deleteResponse["message"])
	deletedData := deleteResponse["data"].(map[string]any)
	require.NotNil(t, deletedData["deleted_at"])
	deletedVersion := int64(deletedData["version"].(float64))

	restoreCtx, restoreRecorder := newTicketTestContext(t, http.MethodPost, "/api/admin/tickets/trash/"+ticket.PublicId+"/restore", 1, map[string]any{
		"expected_version": deletedVersion,
	})
	setTicketPublicIDParam(restoreCtx, ticket.PublicId)
	RestoreTicketAdmin(restoreCtx)
	restoreResponse := decodeJSONResponse(t, restoreRecorder)
	require.Equal(t, true, restoreResponse["success"], restoreResponse["message"])
	require.Nil(t, restoreResponse["data"].(map[string]any)["deleted_at"])
}

func TestListAllTicketsSeesEveryUsersTickets(t *testing.T) {
	setupTicketControllerTest(t)
	_, _, err := model.CreateTicket(7, 7, model.TicketInitiatedByUser, model.TicketCategoryGeneral, model.TicketPriorityNormal, "s1", "b1", "c1")
	require.NoError(t, err)
	_, _, err = model.CreateTicket(999, 999, model.TicketInitiatedByUser, model.TicketCategoryGeneral, model.TicketPriorityNormal, "s2", "b2", "c2")
	require.NoError(t, err)

	ctx, recorder := newTicketTestContext(t, http.MethodGet, "/api/admin/tickets", 100, nil)
	ctx.Set("role", common.RoleRootUser)
	ListAllTickets(ctx)

	var response struct {
		Data struct {
			Total int `json:"total"`
		} `json:"data"`
	}
	require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &response))
	require.Equal(t, 2, response.Data.Total, "admin listing must span every user's tickets")
}

func TestListAllTicketsFiltersAndReturnsTags(t *testing.T) {
	setupTicketControllerTest(t)
	bugTicket, _, err := model.CreateTicket(7, 7, model.TicketInitiatedByUser, model.TicketCategoryBug, model.TicketPriorityNormal, "bug", "body", "tags-c1")
	require.NoError(t, err)
	billingTicket, _, err := model.CreateTicket(8, 8, model.TicketInitiatedByUser, model.TicketCategoryBilling, model.TicketPriorityNormal, "billing", "body", "tags-c2")
	require.NoError(t, err)
	require.NoError(t, model.AddTicketTags(bugTicket.Id, []string{"Bug", "Urgent"}))
	require.NoError(t, model.AddTicketTags(billingTicket.Id, []string{"billing"}))

	ctx, recorder := newTicketTestContext(t, http.MethodGet, "/api/admin/tickets?tags=bug", 100, nil)
	ctx.Set("role", common.RoleRootUser)
	ListAllTickets(ctx)

	var response struct {
		Success bool `json:"success"`
		Data    struct {
			Total int `json:"total"`
			Items []struct {
				PublicID string   `json:"public_id"`
				Tags     []string `json:"tags"`
			} `json:"items"`
		} `json:"data"`
	}
	require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &response))
	require.True(t, response.Success)
	require.Equal(t, 1, response.Data.Total)
	require.Len(t, response.Data.Items, 1)
	require.Equal(t, bugTicket.PublicId, response.Data.Items[0].PublicID)
	require.Equal(t, []string{"bug", "urgent"}, response.Data.Items[0].Tags)
}

func TestListAllTicketsRejectsInvalidTagFilter(t *testing.T) {
	setupTicketControllerTest(t)
	invalidTag := strings.Repeat("x", model.TicketTagMaxLength+1)
	ctx, recorder := newTicketTestContext(t, http.MethodGet, "/api/admin/tickets?tags="+invalidTag, 100, nil)
	ListAllTickets(ctx)

	response := decodeJSONResponse(t, recorder)
	require.Equal(t, false, response["success"])
	require.Contains(t, response["message"], "ticket tag")
}

func TestReplyTicketAdminInternalNoteIsAllowed(t *testing.T) {
	setupTicketControllerTest(t)
	ticket, _, err := model.CreateTicket(7, 7, model.TicketInitiatedByUser, model.TicketCategoryGeneral, model.TicketPriorityNormal, "s", "b", "create-1")
	require.NoError(t, err)

	ctx, recorder := newTicketTestContext(t, http.MethodPost, "/api/admin/tickets/"+ticket.PublicId+"/messages", 100, map[string]any{
		"body": "internal note for staff only", "internal": true, "client_request_id": "reply-1",
	})
	setTicketPublicIDParam(ctx, ticket.PublicId)
	ReplyTicketAdmin(ctx)

	require.Equal(t, true, decodeJSONResponse(t, recorder)["success"])

	var msg model.TicketMessage
	require.NoError(t, model.DB.Where("ticket_id = ? AND client_request_id = ?", ticket.Id, "reply-1").First(&msg).Error)
	require.Equal(t, model.TicketVisibilityInternal, msg.Visibility, "staff must be able to leave an internal note")
}

func TestResolveReopenAndAssignTicketAdmin(t *testing.T) {
	setupTicketControllerTest(t)
	ticket, _, err := model.CreateTicket(7, 7, model.TicketInitiatedByUser, model.TicketCategoryGeneral, model.TicketPriorityNormal, "s", "b", "create-1")
	require.NoError(t, err)
	require.NoError(t, model.DB.Create(&model.User{
		Id: 200, Username: "assignee", Password: "password", Group: "default",
		Role: common.RoleAdminUser, Status: common.UserStatusEnabled,
	}).Error)

	resolveCtx, resolveRecorder := newTicketTestContext(t, http.MethodPost, "/api/admin/tickets/"+ticket.PublicId+"/resolve", 100, map[string]any{
		"expected_version": ticket.Version,
	})
	setTicketPublicIDParam(resolveCtx, ticket.PublicId)
	ResolveTicketAdmin(resolveCtx)
	require.Equal(t, true, decodeJSONResponse(t, resolveRecorder)["success"])

	var resolved model.Ticket
	require.NoError(t, model.DB.First(&resolved, ticket.Id).Error)
	require.Equal(t, model.TicketStatusResolved, resolved.Status)

	reopenCtx, reopenRecorder := newTicketTestContext(t, http.MethodPost, "/api/admin/tickets/"+ticket.PublicId+"/reopen", 100, map[string]any{
		"expected_version": resolved.Version,
	})
	setTicketPublicIDParam(reopenCtx, ticket.PublicId)
	ReopenTicketAdmin(reopenCtx)
	require.Equal(t, true, decodeJSONResponse(t, reopenRecorder)["success"])

	var reopened model.Ticket
	require.NoError(t, model.DB.First(&reopened, ticket.Id).Error)
	require.Equal(t, model.TicketStatusOpen, reopened.Status)

	assignCtx, assignRecorder := newTicketTestContext(t, http.MethodPost, "/api/admin/tickets/"+ticket.PublicId+"/assign", 100, map[string]any{
		"assignee_user_id": 200, "expected_version": reopened.Version,
	})
	setTicketPublicIDParam(assignCtx, ticket.PublicId)
	AssignTicketAdmin(assignCtx)
	require.Equal(t, true, decodeJSONResponse(t, assignRecorder)["success"])

	var assigned model.Ticket
	require.NoError(t, model.DB.First(&assigned, ticket.Id).Error)
	require.NotNil(t, assigned.AssignedTo)
	require.Equal(t, 200, *assigned.AssignedTo)
}

// TestAssignTicketAdminRejectsInvalidAssignee pins validateTicketAssignee: a
// nonexistent id, a disabled account, and a regular customer must all be
// rejected, and rejection must not mutate the ticket's assignment.
func TestAssignTicketAdminRejectsInvalidAssignee(t *testing.T) {
	setupTicketControllerTest(t)
	require.NoError(t, model.DB.Create(&model.User{
		Id: 300, Username: "disabled-staff", Password: "password", Group: "default", AffCode: "aff300",
		Role: common.RoleAdminUser, Status: common.UserStatusDisabled,
	}).Error)
	require.NoError(t, model.DB.Create(&model.User{
		Id: 400, Username: "customer", Password: "password", Group: "default", AffCode: "aff400",
		Role: common.RoleCommonUser, Status: common.UserStatusEnabled,
	}).Error)

	tests := []struct {
		name         string
		assigneeID   int
		wantContains string
	}{
		{name: "nonexistent user", assigneeID: 999999, wantContains: "does not refer to an existing user"},
		{name: "disabled user", assigneeID: 300, wantContains: "disabled user"},
		{name: "regular customer", assigneeID: 400, wantContains: "does not refer to a staff account"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			ticket, _, err := model.CreateTicket(7, 7, model.TicketInitiatedByUser, model.TicketCategoryGeneral, model.TicketPriorityNormal, "s", "b", "create-"+tt.name)
			require.NoError(t, err)

			ctx, recorder := newTicketTestContext(t, http.MethodPost, "/api/admin/tickets/"+ticket.PublicId+"/assign", 100, map[string]any{
				"assignee_user_id": tt.assigneeID, "expected_version": ticket.Version,
			})
			setTicketPublicIDParam(ctx, ticket.PublicId)
			AssignTicketAdmin(ctx)

			response := decodeJSONResponse(t, recorder)
			require.Equal(t, false, response["success"])
			require.Contains(t, response["message"], tt.wantContains)

			var reloaded model.Ticket
			require.NoError(t, model.DB.First(&reloaded, ticket.Id).Error)
			require.Nil(t, reloaded.AssignedTo, "a rejected assignee must not be written")
		})
	}
}

func TestGetTicketUnreadCountAdmin(t *testing.T) {
	setupTicketControllerTest(t)
	ticket, _, err := model.CreateTicket(7, 7, model.TicketInitiatedByUser, model.TicketCategoryGeneral, model.TicketPriorityNormal, "s", "b", "create-1")
	require.NoError(t, err)
	_, _, err = model.ReplyToTicket(ticket.PublicId, 7, model.TicketAuthorKindUser, model.TicketVisibilityPublic, "user follow-up", "reply-1")
	require.NoError(t, err)

	ctx, recorder := newTicketTestContext(t, http.MethodGet, "/api/admin/tickets/unread-count", 100, nil)
	GetTicketUnreadCountAdmin(ctx)

	var response struct {
		Data struct {
			UnreadTicketCount int64 `json:"unread_ticket_count"`
		} `json:"data"`
	}
	require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &response))
	require.Equal(t, int64(1), response.Data.UnreadTicketCount)
}

func TestGetTicketAdminOmitsUserProfileWithoutPermission(t *testing.T) {
	setupTicketControllerTest(t)
	require.NoError(t, model.DB.Create(&model.User{
		Id:       7,
		Username: "profile-user",
		Password: "password",
		Group:    "default",
		Quota:    500,
		Status:   common.UserStatusEnabled,
	}).Error)
	ticket, _, err := model.CreateTicket(7, 7, model.TicketInitiatedByUser, model.TicketCategoryGeneral, model.TicketPriorityNormal, "s", "b", "create-1")
	require.NoError(t, err)

	ctx, recorder := newTicketTestContext(t, http.MethodGet, "/api/admin/tickets/"+ticket.PublicId, 100, nil)
	ctx.Set("role", common.RoleAdminUser)
	setTicketPublicIDParam(ctx, ticket.PublicId)
	GetTicketAdmin(ctx)

	response := decodeJSONResponse(t, recorder)
	require.Equal(t, true, response["success"])
	data, ok := response["data"].(map[string]any)
	require.True(t, ok)
	require.NotContains(t, data, "user_profile", "an ordinary admin without authz.TicketViewUserProfile must not see the requester's account details")
}

func TestGetTicketAdminIncludesUserProfileForRootCaller(t *testing.T) {
	setupTicketControllerTest(t)
	require.NoError(t, model.DB.Create(&model.User{
		Id:       7,
		Username: "profile-user",
		Password: "password",
		Group:    "vip",
		Quota:    12345,
		Role:     common.RoleCommonUser,
		Status:   common.UserStatusEnabled,
	}).Error)
	ticket, _, err := model.CreateTicket(7, 7, model.TicketInitiatedByUser, model.TicketCategoryGeneral, model.TicketPriorityNormal, "s", "b", "create-1")
	require.NoError(t, err)

	ctx, recorder := newTicketTestContext(t, http.MethodGet, "/api/admin/tickets/"+ticket.PublicId, 100, nil)
	ctx.Set("role", common.RoleRootUser)
	setTicketPublicIDParam(ctx, ticket.PublicId)
	GetTicketAdmin(ctx)

	response := decodeJSONResponse(t, recorder)
	require.Equal(t, true, response["success"])
	data, ok := response["data"].(map[string]any)
	require.True(t, ok)
	profile, ok := data["user_profile"].(map[string]any)
	require.True(t, ok, "root caller must see the requester's account details via the superuser bypass")
	require.Equal(t, float64(12345), profile["quota"])
	require.Equal(t, "vip", profile["group"])
	require.Equal(t, float64(common.RoleCommonUser), profile["role"])
	require.Equal(t, float64(common.UserStatusEnabled), profile["status"])
}
