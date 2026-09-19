package storage_setting

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestLoadTicketAttachmentEnvironment(t *testing.T) {
	ApplySavedSettings(StorageSettings{}, "", false, false)
	t.Cleanup(func() { ApplySavedSettings(StorageSettings{}, "", false, false) })
	t.Setenv("TICKET_STORAGE_ENDPOINT", "https://s3.example.com")
	t.Setenv("TICKET_STORAGE_REGION", "auto")
	t.Setenv("TICKET_STORAGE_BUCKET", "tickets")
	t.Setenv("TICKET_STORAGE_ACCESS_KEY_ID", "public-test-access")
	t.Setenv("TICKET_STORAGE_SECRET_ACCESS_KEY", "public-test-secret")
	t.Setenv("TICKET_STORAGE_PUBLIC_BASE_URL", "https://files.example.com/tickets")
	t.Setenv("TICKET_STORAGE_FORCE_PATH_STYLE", "true")

	require.NoError(t, LoadTicketAttachmentEnvironment())
	settings, secret, err := SnapshotForUse()
	require.NoError(t, err)
	require.Equal(t, "https://s3.example.com", settings.Location.Endpoint)
	require.Equal(t, "tickets", settings.Location.Bucket)
	require.Equal(t, "https://files.example.com/tickets", settings.Location.PublicBaseURL)
	require.True(t, settings.Location.ForcePathStyle)
	require.Equal(t, "public-test-secret", secret)
}

func TestLoadTicketAttachmentEnvironmentRejectsIncompleteConfig(t *testing.T) {
	ApplySavedSettings(StorageSettings{}, "", false, false)
	t.Cleanup(func() { ApplySavedSettings(StorageSettings{}, "", false, false) })
	t.Setenv("TICKET_STORAGE_ENDPOINT", "https://s3.example.com")
	require.Error(t, LoadTicketAttachmentEnvironment())
}
