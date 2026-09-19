package controller

import (
	"errors"
	"net/http"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/dto"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting/ticket_setting"
	"github.com/gin-gonic/gin"
)

func GetTicketSettings(c *gin.Context) {
	settings := ticket_setting.GetTicketSettings()
	common.ApiSuccess(c, dto.TicketSettingsResponse{Version: settings.Version, Enabled: settings.Enabled})
}

func UpdateTicketSettings(c *gin.Context) {
	var request dto.UpdateTicketSettingsRequest
	if err := common.UnmarshalBodyReusableStrict(c, &request); err != nil {
		common.ApiErrorMsg(c, "invalid request: "+err.Error())
		return
	}
	saved, err := model.UpdateTicketSettingsCAS(request.ExpectedVersion, request.Enabled)
	if errors.Is(err, model.ErrTicketSettingsVersionConflict) {
		current := ticket_setting.GetTicketSettings()
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": "ticket settings were modified elsewhere, please reload",
			"data":    gin.H{"version_conflict": true, "current_version": current.Version},
		})
		return
	}
	if err != nil {
		common.ApiError(c, err)
		return
	}
	recordManageAudit(c, "ticket.settings.update", map[string]any{"version": saved.Version, "enabled": saved.Enabled})
	common.ApiSuccess(c, dto.TicketSettingsResponse{Version: saved.Version, Enabled: saved.Enabled})
}
