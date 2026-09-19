package model

import (
	"errors"
	"fmt"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/setting/ticket_setting"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

const OptionTicketSettings = "TicketSettings"

var ErrTicketSettingsVersionConflict = errors.New("ticket settings version conflict")

func UpdateTicketSettingsCAS(expectedVersion int64, enabled bool) (ticket_setting.TicketSettings, error) {
	saved := ticket_setting.TicketSettings{Version: expectedVersion + 1, Enabled: enabled}
	bundle, err := common.Marshal(saved)
	if err != nil {
		return ticket_setting.TicketSettings{}, err
	}
	err = DB.Transaction(func(tx *gorm.DB) error {
		var option Option
		err := lockForUpdate(tx).Where(commonKeyCol+" = ?", OptionTicketSettings).First(&option).Error
		if errors.Is(err, gorm.ErrRecordNotFound) {
			if expectedVersion != 0 {
				return ErrTicketSettingsVersionConflict
			}
			result := tx.Clauses(clause.OnConflict{DoNothing: true}).Create(&Option{Key: OptionTicketSettings, Value: string(bundle)})
			if result.Error != nil {
				return result.Error
			}
			if result.RowsAffected != 1 {
				return ErrTicketSettingsVersionConflict
			}
			return nil
		}
		if err != nil {
			return err
		}
		var current ticket_setting.TicketSettings
		if err := common.Unmarshal([]byte(option.Value), &current); err != nil {
			return fmt.Errorf("parse ticket settings: %w", err)
		}
		if current.Version != expectedVersion {
			return ErrTicketSettingsVersionConflict
		}
		result := tx.Model(&Option{}).
			Where(commonKeyCol+" = ? AND value = ?", OptionTicketSettings, option.Value).
			Update("value", string(bundle))
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected != 1 {
			return ErrTicketSettingsVersionConflict
		}
		return nil
	})
	if err != nil {
		return ticket_setting.TicketSettings{}, err
	}
	common.OptionMapRWMutex.Lock()
	if common.OptionMap == nil {
		common.OptionMap = make(map[string]string)
	}
	common.OptionMap[OptionTicketSettings] = string(bundle)
	common.OptionMapRWMutex.Unlock()
	ticket_setting.ApplySavedSettings(saved)
	return saved, nil
}
