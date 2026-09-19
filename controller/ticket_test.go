package controller

import (
	"bytes"
	"fmt"
	"net/http"
	"net/http/httptest"
	"path"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting/storage_setting"
	"github.com/QuantumNous/new-api/setting/ticket_setting"
	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func setupTicketControllerTest(t *testing.T) *gorm.DB {
	t.Helper()
	gin.SetMode(gin.TestMode)
	originalDB, originalLogDB := model.DB, model.LOG_DB
	originalTicketSettings := ticket_setting.GetTicketSettings()
	common.OptionMapRWMutex.Lock()
	originalOptionMap := common.OptionMap
	common.OptionMap = make(map[string]string)
	common.OptionMapRWMutex.Unlock()

	dsn := fmt.Sprintf("file:%s?mode=memory&cache=shared", strings.ReplaceAll(t.Name(), "/", "_"))
	db, err := gorm.Open(sqlite.Open(dsn), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&model.Ticket{}, &model.TicketMessage{}, &model.TicketReadCursor{},
		&model.Log{}, &model.User{}, &model.Option{}, &model.TicketAttachmentUpload{}, &model.TicketTag{}, &model.TicketCreateRequest{}))
	model.DB, model.LOG_DB = db, db
	ticket_setting.ApplySavedSettings(ticket_setting.TicketSettings{Version: 0, Enabled: true})

	t.Cleanup(func() {
		model.DB, model.LOG_DB = originalDB, originalLogDB
		ticket_setting.ApplySavedSettings(originalTicketSettings)
		common.OptionMapRWMutex.Lock()
		common.OptionMap = originalOptionMap
		common.OptionMapRWMutex.Unlock()
		if sqlDB, closeErr := db.DB(); closeErr == nil {
			_ = sqlDB.Close()
		}
	})
	return db
}

func recordReadyTicketAttachmentForTest(t *testing.T, storageKey string, uploaderUserID int) {
	t.Helper()
	publicID := uuid.NewString()
	require.NoError(t, model.DB.Create(&model.TicketAttachmentUpload{
		PublicId:       &publicID,
		OriginalName:   path.Base(storageKey),
		StorageKey:     storageKey,
		UploaderUserId: uploaderUserID,
		CreatedAt:      common.GetTimestamp(),
	}).Error)
}

// newTicketTestContext builds a gin test context with a JSON body and the
// given caller id, plus the recorder callers use to inspect the response.
func newTicketTestContext(t *testing.T, method, path string, userID int, body any) (*gin.Context, *httptest.ResponseRecorder) {
	t.Helper()
	var reader *bytes.Reader
	if body != nil {
		data, err := common.Marshal(body)
		require.NoError(t, err)
		reader = bytes.NewReader(data)
	} else {
		reader = bytes.NewReader(nil)
	}
	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Request = httptest.NewRequest(method, path, reader)
	ctx.Request.Header.Set("Content-Type", "application/json")
	ctx.Set("id", userID)
	return ctx, recorder
}

func setTicketPublicIDParam(ctx *gin.Context, publicID string) {
	ctx.Params = append(ctx.Params, gin.Param{Key: "public_id", Value: publicID})
}

func decodeJSONResponse(t *testing.T, recorder *httptest.ResponseRecorder) map[string]any {
	t.Helper()
	var response map[string]any
	require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &response))
	return response
}

func TestCreateTicketRejectsUnknownField(t *testing.T) {
	setupTicketControllerTest(t)
	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	body := `{"category":"general","priority":"normal","subject":"help","body":"please help","client_request_id":"r1","bogus_field":"x"}`
	ctx.Request = httptest.NewRequest(http.MethodPost, "/api/tickets", strings.NewReader(body))
	ctx.Request.Header.Set("Content-Type", "application/json")
	ctx.Set("id", 7)

	CreateTicket(ctx)

	response := decodeJSONResponse(t, recorder)
	require.Equal(t, false, response["success"])
	require.Contains(t, response["message"], "unknown field")

	var count int64
	require.NoError(t, model.DB.Model(&model.Ticket{}).Count(&count).Error)
	require.Zero(t, count, "no partial row on decode failure")
}

func TestCreateTicketRejectedWhenDisabled(t *testing.T) {
	setupTicketControllerTest(t)
	ticket_setting.ApplySavedSettings(ticket_setting.TicketSettings{Version: 0, Enabled: false})

	ctx, recorder := newTicketTestContext(t, http.MethodPost, "/api/tickets", 7, map[string]any{
		"category": "general", "priority": "normal", "subject": "help", "body": "please", "client_request_id": "r1",
	})
	CreateTicket(ctx)

	response := decodeJSONResponse(t, recorder)
	require.Equal(t, false, response["success"])
	require.Contains(t, response["message"], "disabled")

	var count int64
	require.NoError(t, model.DB.Model(&model.Ticket{}).Count(&count).Error)
	require.Zero(t, count, "no ticket must be created while the feature is disabled")
}

func TestGetTicketCapabilitiesReflectsTicketAndStorageAvailability(t *testing.T) {
	setupTicketControllerTest(t)
	applyTestStorageBaseURL(t, "https://cdn.example.com")
	ctx, recorder := newTicketTestContext(t, http.MethodGet, "/api/tickets/capabilities", 7, nil)
	GetTicketCapabilities(ctx)
	response := decodeJSONResponse(t, recorder)
	data := response["data"].(map[string]any)
	require.Equal(t, true, data["enabled"])
	require.Equal(t, false, data["attachments_enabled"])
}

func TestCreateTicketAndGetMyTicketRoundTrip(t *testing.T) {
	setupTicketControllerTest(t)
	ctx, recorder := newTicketTestContext(t, http.MethodPost, "/api/tickets", 7, map[string]any{
		"category": "general", "priority": "normal", "subject": "help", "body": "please help", "client_request_id": "r1",
	})
	CreateTicket(ctx)

	var createResp struct {
		Success bool `json:"success"`
		Data    struct {
			PublicId string `json:"public_id"`
			UserId   int    `json:"user_id"`
		} `json:"data"`
	}
	require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &createResp))
	require.True(t, createResp.Success)
	require.NotEmpty(t, createResp.Data.PublicId)
	require.Equal(t, 7, createResp.Data.UserId)

	// Response must never leak the sequential primary key.
	require.NotContains(t, recorder.Body.String(), `"id":1,`)

	// Owner can fetch it.
	getCtx, getRecorder := newTicketTestContext(t, http.MethodGet, "/api/tickets/"+createResp.Data.PublicId, 7, nil)
	setTicketPublicIDParam(getCtx, createResp.Data.PublicId)
	GetMyTicket(getCtx)
	require.Equal(t, true, decodeJSONResponse(t, getRecorder)["success"])

	// A different user must not be able to fetch it.
	otherCtx, otherRecorder := newTicketTestContext(t, http.MethodGet, "/api/tickets/"+createResp.Data.PublicId, 999, nil)
	setTicketPublicIDParam(otherCtx, createResp.Data.PublicId)
	GetMyTicket(otherCtx)
	require.Equal(t, false, decodeJSONResponse(t, otherRecorder)["success"], "a different user must not read someone else's ticket")
}

func TestReplyMyTicketForcesPublicVisibilityRegardlessOfInternalFlag(t *testing.T) {
	setupTicketControllerTest(t)
	ticket, _, err := model.CreateTicket(7, 7, model.TicketInitiatedByUser, model.TicketCategoryGeneral, model.TicketPriorityNormal, "s", "b", "create-1")
	require.NoError(t, err)

	ctx, _ := newTicketTestContext(t, http.MethodPost, "/api/tickets/"+ticket.PublicId+"/messages", 7, map[string]any{
		"body": "trying to sneak an internal note", "internal": true, "client_request_id": "reply-1",
	})
	setTicketPublicIDParam(ctx, ticket.PublicId)
	ReplyMyTicket(ctx)

	var msg model.TicketMessage
	require.NoError(t, model.DB.Where("ticket_id = ? AND client_request_id = ?", ticket.Id, "reply-1").First(&msg).Error)
	require.Equal(t, model.TicketVisibilityPublic, msg.Visibility, "a regular user must never be able to create an internal note")
}

func TestReplyMyTicketRejectsOtherUsersTicket(t *testing.T) {
	setupTicketControllerTest(t)
	ticket, _, err := model.CreateTicket(7, 7, model.TicketInitiatedByUser, model.TicketCategoryGeneral, model.TicketPriorityNormal, "s", "b", "create-1")
	require.NoError(t, err)

	ctx, recorder := newTicketTestContext(t, http.MethodPost, "/api/tickets/"+ticket.PublicId+"/messages", 999, map[string]any{
		"body": "trying to reply to someone else's ticket", "client_request_id": "reply-1",
	})
	setTicketPublicIDParam(ctx, ticket.PublicId)
	ReplyMyTicket(ctx)

	require.Equal(t, false, decodeJSONResponse(t, recorder)["success"])

	var count int64
	require.NoError(t, model.DB.Model(&model.TicketMessage{}).Where("ticket_id = ?", ticket.Id).Count(&count).Error)
	require.Equal(t, int64(1), count, "only the original creation message must exist")
}

func TestResolveMyTicketVersionConflictShapesResponse(t *testing.T) {
	setupTicketControllerTest(t)
	ticket, _, err := model.CreateTicket(7, 7, model.TicketInitiatedByUser, model.TicketCategoryGeneral, model.TicketPriorityNormal, "s", "b", "create-1")
	require.NoError(t, err)

	ctx, recorder := newTicketTestContext(t, http.MethodPost, "/api/tickets/"+ticket.PublicId+"/resolve", 7, map[string]any{
		"expected_version": ticket.Version - 1,
	})
	setTicketPublicIDParam(ctx, ticket.PublicId)
	ResolveMyTicket(ctx)

	response := decodeJSONResponse(t, recorder)
	require.Equal(t, false, response["success"])
	data, ok := response["data"].(map[string]any)
	require.True(t, ok)
	require.Equal(t, true, data["version_conflict"])
}

func TestGetMyTicketUnreadCount(t *testing.T) {
	setupTicketControllerTest(t)
	ticket, _, err := model.CreateTicket(7, 7, model.TicketInitiatedByUser, model.TicketCategoryGeneral, model.TicketPriorityNormal, "s", "b", "create-1")
	require.NoError(t, err)
	_, _, err = model.ReplyToTicket(ticket.PublicId, 100, model.TicketAuthorKindStaff, model.TicketVisibilityPublic, "staff reply", "reply-1")
	require.NoError(t, err)

	ctx, recorder := newTicketTestContext(t, http.MethodGet, "/api/tickets/unread-count", 7, nil)
	GetMyTicketUnreadCount(ctx)

	var response struct {
		Data struct {
			UnreadTicketCount int64 `json:"unread_ticket_count"`
		} `json:"data"`
	}
	require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &response))
	require.Equal(t, int64(1), response.Data.UnreadTicketCount)
}

func TestListMyTicketsIncludesPerTicketUnreadCount(t *testing.T) {
	setupTicketControllerTest(t)
	ticket, _, err := model.CreateTicket(7, 7, model.TicketInitiatedByUser, model.TicketCategoryGeneral, model.TicketPriorityNormal, "s", "b", "create-list-unread")
	require.NoError(t, err)
	_, _, err = model.ReplyToTicket(ticket.PublicId, 100, model.TicketAuthorKindStaff, model.TicketVisibilityPublic, "staff reply", "reply-list-unread")
	require.NoError(t, err)

	ctx, recorder := newTicketTestContext(t, http.MethodGet, "/api/tickets/?p=1&page_size=20", 7, nil)
	ListMyTickets(ctx)

	var response struct {
		Data struct {
			Items []struct {
				UnreadCount int64 `json:"unread_count"`
			} `json:"items"`
		} `json:"data"`
	}
	require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &response))
	require.Len(t, response.Data.Items, 1)
	require.Equal(t, int64(1), response.Data.Items[0].UnreadCount)
}

// applyTestStorageBaseURL points storage_setting at a fake public base URL so
// attachment-url validation has something to match against, and restores the
// zero-value setting afterward.
func applyTestStorageBaseURL(t *testing.T, base string) {
	t.Helper()
	storage_setting.ApplySavedSettings(storage_setting.StorageSettings{
		Location: storage_setting.StorageLocation{PublicBaseURL: base},
	}, "", false, false)
	t.Cleanup(func() {
		storage_setting.ApplySavedSettings(storage_setting.StorageSettings{}, "", false, false)
	})
}

func TestCreateTicketRejectsAttachmentUrlNotUploadedByCaller(t *testing.T) {
	setupTicketControllerTest(t)
	applyTestStorageBaseURL(t, "https://cdn.example.com")

	ctx, recorder := newTicketTestContext(t, http.MethodPost, "/api/tickets", 7, map[string]any{
		"category": "general", "priority": "normal", "subject": "s", "body": "b", "client_request_id": "r1",
		"attachment_urls": []string{"https://cdn.example.com/tickets/999/foreign.png"},
	})
	CreateTicket(ctx)

	response := decodeJSONResponse(t, recorder)
	require.Equal(t, false, response["success"])
	require.Contains(t, response["message"], "not uploaded by you")

	var count int64
	require.NoError(t, model.DB.Model(&model.Ticket{}).Count(&count).Error)
	require.Zero(t, count, "no partial ticket row when the attachment fails ownership validation")
}

func TestCreateTicketAllowsAttachmentUrlUploadedByCaller(t *testing.T) {
	setupTicketControllerTest(t)
	applyTestStorageBaseURL(t, "https://cdn.example.com")
	recordReadyTicketAttachmentForTest(t, "tickets/7/mine.png", 7)

	ctx, recorder := newTicketTestContext(t, http.MethodPost, "/api/tickets", 7, map[string]any{
		"category": "general", "priority": "normal", "subject": "s", "body": "b", "client_request_id": "r1",
		"attachment_urls": []string{"https://cdn.example.com/tickets/7/mine.png"},
	})
	CreateTicket(ctx)

	response := decodeJSONResponse(t, recorder)
	require.Equal(t, true, response["success"], response["message"])
}
