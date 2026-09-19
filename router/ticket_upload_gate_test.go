package router

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/controller"
	"github.com/QuantumNous/new-api/setting/ticket_setting"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func withTicketSystemEnabledState(t *testing.T, enabled bool) {
	t.Helper()
	original := ticket_setting.GetTicketSettings()
	t.Cleanup(func() { ticket_setting.ApplySavedSettings(original) })
	updated := original
	updated.Enabled = enabled
	ticket_setting.ApplySavedSettings(updated)
}

func decodeTicketUploadGateResponse(t *testing.T, recorder *httptest.ResponseRecorder) (success bool, message string) {
	t.Helper()
	var resp struct {
		Success bool   `json:"success"`
		Message string `json:"message"`
	}
	require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &resp))
	return resp.Success, resp.Message
}

// TestTicketUploadGateRejectsWhenTicketSystemDisabled is the regression test
// for the master-switch bypass: with the ticket system disabled, CreateTicket
// already rejected, but POST /api/tickets/upload still accepted object data.
// The gate must reject before the upload handler ever runs (and therefore
// before it reads the multipart body), with the same error shape CreateTicket
// uses.
func TestTicketUploadGateRejectsWhenTicketSystemDisabled(t *testing.T) {
	gin.SetMode(gin.TestMode)
	withTicketSystemEnabledState(t, false)

	handlerReached := false
	engine := gin.New()
	engine.POST("/api/tickets/upload", requireTicketSystemEnabled, func(_ *gin.Context) {
		handlerReached = true
	})

	req := httptest.NewRequest(http.MethodPost, "/api/tickets/upload", strings.NewReader("object-data"))
	recorder := httptest.NewRecorder()
	engine.ServeHTTP(recorder, req)

	require.False(t, handlerReached, "a disabled ticket system must reject the upload before the handler receives any object data")
	require.Equal(t, http.StatusOK, recorder.Code)
	success, message := decodeTicketUploadGateResponse(t, recorder)
	assert.False(t, success)
	assert.Equal(t, "the ticket system is currently disabled", message)
}

// TestTicketUploadGatePassesToUploadHandlerWhenEnabled proves the gate is
// pass-through when the ticket system is on: the request must clear the gate
// and reach the real upload handler, which (with storage unconfigured in this
// test) fails at its own storage-availability check instead.
func TestTicketUploadGatePassesToUploadHandlerWhenEnabled(t *testing.T) {
	gin.SetMode(gin.TestMode)
	withTicketSystemEnabledState(t, true)

	engine := gin.New()
	engine.POST("/api/tickets/upload", requireTicketSystemEnabled, controller.UploadTicketAttachment)

	req := httptest.NewRequest(http.MethodPost, "/api/tickets/upload", strings.NewReader("object-data"))
	recorder := httptest.NewRecorder()
	engine.ServeHTTP(recorder, req)

	require.Equal(t, http.StatusOK, recorder.Code)
	success, message := decodeTicketUploadGateResponse(t, recorder)
	assert.False(t, success)
	assert.Equal(t, "attachments are currently unavailable, please contact the administrator", message)
}
