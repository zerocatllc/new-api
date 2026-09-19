package ticket_setting

import (
	"fmt"
	"strings"
	"sync"

	"github.com/QuantumNous/new-api/common"
)

type TicketSettings struct {
	Version int64 `json:"version"`
	Enabled bool  `json:"enabled"`
}

var (
	mu       sync.RWMutex
	settings TicketSettings
)

func GetTicketSettings() TicketSettings {
	mu.RLock()
	defer mu.RUnlock()
	return settings
}

func Version() int64 {
	return GetTicketSettings().Version
}

func Enabled() bool {
	return GetTicketSettings().Enabled
}

func BundleJSON() string {
	data, err := common.Marshal(GetTicketSettings())
	if err != nil {
		return ""
	}
	return string(data)
}

func LoadBundle(value string) error {
	value = strings.TrimSpace(value)
	if value == "" {
		return nil
	}
	var loaded TicketSettings
	if err := common.Unmarshal([]byte(value), &loaded); err != nil {
		return fmt.Errorf("parse ticket settings bundle: %w", err)
	}
	ApplySavedSettings(loaded)
	return nil
}

func ApplySavedSettings(next TicketSettings) {
	mu.Lock()
	settings = next
	mu.Unlock()
}
