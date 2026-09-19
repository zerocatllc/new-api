package model

import (
	"errors"
	"fmt"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/setting/storage_setting"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

const (
	OptionStorageSettings        = "StorageSettings"
	OptionStorageSecretAccessKey = "StorageSecretAccessKeyEnc"
)

var ErrStorageSettingsVersionConflict = errors.New("storage settings version conflict")

func StorageSettingsBundleForCAS(expectedVersion int64, fallback string) string {
	common.OptionMapRWMutex.RLock()
	raw := common.OptionMap[OptionStorageSettings]
	common.OptionMapRWMutex.RUnlock()
	if strings.TrimSpace(raw) == "" {
		return fallback
	}
	var persisted storage_setting.StorageSettings
	if err := common.Unmarshal([]byte(raw), &persisted); err != nil || persisted.Version != expectedVersion {
		return fallback
	}
	return raw
}

func UpdateStorageOptionsBulkCAS(expectedBundleJSON, bundleJSON, secretCiphertext string, retainSecret bool, saved storage_setting.StorageSettings, plaintextSecret string, secretPersisted bool) error {
	err := DB.Transaction(func(tx *gorm.DB) error {
		result := tx.Model(&Option{}).
			Where(clause.And(
				clause.Eq{Column: clause.Column{Name: "key"}, Value: OptionStorageSettings},
				clause.Eq{Column: clause.Column{Name: "value"}, Value: expectedBundleJSON},
			)).
			Update("value", bundleJSON)
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected == 0 {
			result = tx.Clauses(clause.OnConflict{DoNothing: true}).Create(&Option{Key: OptionStorageSettings, Value: bundleJSON})
			if result.Error != nil {
				return result.Error
			}
			if result.RowsAffected != 1 {
				return ErrStorageSettingsVersionConflict
			}
		}
		if retainSecret {
			return nil
		}
		return tx.Clauses(clause.OnConflict{
			Columns:   []clause.Column{{Name: "key"}},
			DoUpdates: clause.AssignmentColumns([]string{"value"}),
		}).Create(&Option{Key: OptionStorageSecretAccessKey, Value: secretCiphertext}).Error
	})
	if err != nil {
		return err
	}
	values := map[string]string{OptionStorageSettings: bundleJSON}
	if !retainSecret {
		values[OptionStorageSecretAccessKey] = secretCiphertext
	}
	common.OptionMapRWMutex.Lock()
	for key, value := range values {
		common.OptionMap[key] = value
	}
	common.OptionMapRWMutex.Unlock()
	storage_setting.ApplySavedSettings(saved, plaintextSecret, retainSecret, secretPersisted)
	return nil
}

func ReloadStorageOptions() (storage_setting.StorageSettings, error) {
	var options []Option
	if err := DB.Where(clause.IN{
		Column: clause.Column{Name: "key"},
		Values: []interface{}{OptionStorageSettings, OptionStorageSecretAccessKey},
	}).Find(&options).Error; err != nil {
		return storage_setting.StorageSettings{}, err
	}
	var bundleFound bool
	for _, option := range options {
		if option.Key == OptionStorageSettings {
			bundleFound = true
			if err := updateOptionMap(option.Key, option.Value); err != nil {
				return storage_setting.StorageSettings{}, err
			}
		}
	}
	if !bundleFound {
		return storage_setting.StorageSettings{}, fmt.Errorf("storage settings option is missing")
	}
	secretFound := false
	for _, option := range options {
		if option.Key == OptionStorageSecretAccessKey {
			secretFound = true
			if err := updateOptionMap(option.Key, option.Value); err != nil {
				return storage_setting.StorageSettings{}, err
			}
		}
	}
	if !secretFound {
		if err := updateOptionMap(OptionStorageSecretAccessKey, ""); err != nil {
			return storage_setting.StorageSettings{}, err
		}
	}
	return storage_setting.GetStorageSettings(), nil
}
