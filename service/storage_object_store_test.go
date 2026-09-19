package service

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"io"
	"net/url"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting/storage_setting"
	"github.com/stretchr/testify/require"
)

func init() {
	// Ensure a stable encryption key exists before common's lazy loader runs in
	// this test binary, so storage secrets can be encrypted/decrypted.
	key := make([]byte, 32)
	_, _ = io.ReadFull(rand.Reader, key)
	_ = os.Setenv(common.StorageSecretEncryptionEnv, base64.StdEncoding.EncodeToString(key))
}

func configureStorageForTest(t *testing.T, version int64, endpoint string, allowPrivate bool) {
	t.Helper()
	ciphertext, err := storage_setting.EncryptSecret("test-secret")
	require.NoError(t, err)
	storage_setting.LoadEncryptedSecret(ciphertext)
	storage_setting.ApplySavedSettings(storage_setting.StorageSettings{
		Version: version,
		Enabled: true,
		Location: storage_setting.StorageLocation{
			Endpoint:             endpoint,
			Region:               "auto",
			Bucket:               "b",
			AccessKeyID:          "AK",
			ForcePathStyle:       true,
			PublicBaseURL:        "https://assets.example.com",
			AllowPrivateEndpoint: allowPrivate,
		},
	}, "test-secret", false, true)
	t.Cleanup(func() {
		storage_setting.LoadEncryptedSecret("")
		storage_setting.ApplySavedSettings(storage_setting.StorageSettings{}, "", false, false)
	})
}

// TestStoragePutRefusesPrivateEndpoint proves the SSRF guard is active in the
// real S3 client path, not just in the unit validator.
func TestStoragePutRefusesPrivateEndpoint(t *testing.T) {
	configureStorageForTest(t, 9001, "https://10.0.0.1", false)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	err := StoragePutObject(ctx, "temporary/_health/x", "text/plain", strings.NewReader("hi"), 2)
	require.Error(t, err)
	require.Contains(t, err.Error(), "refusing restricted address")
}

// TestStoragePutAllowsPrivateWhenEnabled proves allow_private_endpoint relaxes
// the guard: the dial is attempted (and fails to connect, since nothing is
// listening) rather than being refused for being private.
func TestStoragePutAllowsPrivateWhenEnabled(t *testing.T) {
	configureStorageForTest(t, 9002, "https://10.255.255.1", true)
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()

	err := StoragePutObject(ctx, "temporary/_health/x", "text/plain", strings.NewReader("hi"), 2)
	require.Error(t, err)
	require.NotContains(t, err.Error(), "refusing private address")
}

func TestStorageUnavailableWhenDisabled(t *testing.T) {
	storage_setting.LoadEncryptedSecret("")
	storage_setting.ApplySavedSettings(storage_setting.StorageSettings{}, "", false, false)
	err := StoragePutObject(context.Background(), "k", "text/plain", strings.NewReader("x"), 1)
	require.ErrorIs(t, err, ErrStorageUnavailable)
}

// TestBuildTicketAttachmentKeyIgnoresPreservePath is a regression test: a
// ticket attachment key must always be a random, collision-free name, even
// when the general storage policy has PreservePath enabled. Two uploads of
// the same filename reusing the original name as the key would let the
// second upload silently overwrite an object a prior ticket message already
// references.
func TestBuildTicketAttachmentKeyIgnoresPreservePath(t *testing.T) {
	storage_setting.ApplySavedSettings(storage_setting.StorageSettings{
		Policies: storage_setting.StoragePolicySettings{PreservePath: true, ResourcePrefix: "resources"},
	}, "", true, false)

	first := BuildTicketAttachmentKey(7, "report.pdf")
	second := BuildTicketAttachmentKey(7, "report.pdf")

	require.NotEqual(t, first, second, "two uploads of the same filename must never collide on the same key")
	require.True(t, strings.HasSuffix(first, ".pdf"))
	require.Contains(t, first, "resources/tickets/7/")
}

func TestStoragePresignGetSetsRequestedDisposition(t *testing.T) {
	configureStorageForTest(t, 9003, "https://storage.example.com", false)

	for _, tt := range []struct {
		name   string
		inline bool
		want   string
	}{
		{name: "download", want: `attachment; filename=report.txt`},
		{name: "preview", inline: true, want: `inline; filename=report.txt`},
	} {
		t.Run(tt.name, func(t *testing.T) {
			presigned, err := StoragePresignGet(context.Background(), "tickets/7/report.txt", time.Minute, tt.inline)
			require.NoError(t, err)
			parsed, err := url.Parse(presigned)
			require.NoError(t, err)
			require.Equal(t, tt.want, parsed.Query().Get("response-content-disposition"))
		})
	}
}

func TestTicketAttachmentPresignUsesPersistedPlacementAfterConfigSwitch(t *testing.T) {
	configureStorageForTest(t, 22, "https://new-storage.example.com", false)
	ciphertext, err := storage_setting.EncryptSecret("old-secret")
	require.NoError(t, err)
	locationJSON, err := common.Marshal(storage_setting.StorageLocation{
		Endpoint:       "https://old-storage.example.com",
		Region:         "old-region",
		Bucket:         "old-bucket",
		AccessKeyID:    "old-access",
		ForcePathStyle: true,
	})
	require.NoError(t, err)
	version := int64(7)
	location := string(locationJSON)
	upload := &model.TicketAttachmentUpload{
		StorageKey:              "tickets/7/report.txt",
		OriginalName:            "report.txt",
		StorageConfigVersion:    &version,
		StorageLocationJson:     &location,
		StorageSecretCiphertext: &ciphertext,
	}

	presigned, err := StoragePresignTicketAttachment(context.Background(), upload, time.Minute)

	require.NoError(t, err)
	parsed, err := url.Parse(presigned)
	require.NoError(t, err)
	require.Equal(t, "old-storage.example.com", parsed.Host)
	require.Contains(t, parsed.Path, "/old-bucket/tickets/7/report.txt")
	require.NotContains(t, presigned, "new-storage.example.com")
}
