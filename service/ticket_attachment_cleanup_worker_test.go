package service

import (
	"context"
	"errors"
	"path"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/glebarez/sqlite"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func setupTicketAttachmentCleanupTest(t *testing.T) {
	t.Helper()
	original := model.DB
	dsn := "file:" + strings.ReplaceAll(t.Name(), "/", "_") + "?mode=memory&cache=shared"
	db, err := gorm.Open(sqlite.Open(dsn), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&model.Ticket{}, &model.TicketMessage{}, &model.TicketReadCursor{}, &model.User{}, &model.TicketCreateRequest{}, &model.TicketAttachmentUpload{}))
	model.DB = db
	t.Cleanup(func() {
		model.DB = original
		if sqlDB, err := db.DB(); err == nil {
			_ = sqlDB.Close()
		}
	})
}

func withStubbedTicketAttachmentDelete(t *testing.T) *[]string {
	t.Helper()
	original := ticketAttachmentCleanupDeleteFunc
	deleted := make([]string, 0)
	ticketAttachmentCleanupDeleteFunc = func(_ context.Context, upload model.TicketAttachmentUpload) error {
		deleted = append(deleted, upload.StorageKey)
		return nil
	}
	t.Cleanup(func() { ticketAttachmentCleanupDeleteFunc = original })
	return &deleted
}

func mustInsertTicketAttachmentUpload(t *testing.T, key string, uploaderUserID int, createdAt int64) model.TicketAttachmentUpload {
	t.Helper()
	publicID := uuid.NewString()
	row := model.TicketAttachmentUpload{PublicId: &publicID, OriginalName: path.Base(key), StorageKey: key, UploaderUserId: uploaderUserID, CreatedAt: createdAt}
	require.NoError(t, model.DB.Create(&row).Error)
	return row
}

// TestRunTicketAttachmentCleanupOnceDeletesUnreferencedOldUpload is the
// regression test for the orphan-storage bug: an attachment uploaded but
// never attached to any ticket message used to sit forever with no cleanup
// path (StoredObject modeled an expiry lifecycle but had zero callers, and
// TicketAttachmentUpload had no expiry at all).
func TestRunTicketAttachmentCleanupOnceDeletesUnreferencedOldUpload(t *testing.T) {
	setupTicketAttachmentCleanupTest(t)
	configureStorageForTest(t, 1, "https://storage.example.com", false)
	deleted := withStubbedTicketAttachmentDelete(t)

	old := common.GetTimestamp() - int64(ticketAttachmentOrphanRetention.Seconds()) - 3600
	mustInsertTicketAttachmentUpload(t, "permanent/7/orphan.png", 7, old)

	runTicketAttachmentCleanupOnce()

	require.Equal(t, []string{"permanent/7/orphan.png"}, *deleted, "an old, never-attached upload must have its storage object deleted")
	var count int64
	require.NoError(t, model.DB.Model(&model.TicketAttachmentUpload{}).Count(&count).Error)
	require.Zero(t, count, "the provenance row must be deleted along with the storage object")
}

// TestRunTicketAttachmentCleanupOnceKeepsReferencedOldUpload proves the sweep
// never deletes an attachment that a ticket message actually references, no
// matter how old the upload is.
func TestRunTicketAttachmentCleanupOnceKeepsReferencedOldUpload(t *testing.T) {
	setupTicketAttachmentCleanupTest(t)
	configureStorageForTest(t, 1, "https://storage.example.com", false)
	deleted := withStubbedTicketAttachmentDelete(t)

	old := common.GetTimestamp() - int64(ticketAttachmentOrphanRetention.Seconds()) - 3600
	upload := mustInsertTicketAttachmentUpload(t, "permanent/7/attached.png", 7, old)
	attachmentURL := upload.Reference()
	_, _, err := model.CreateTicket(7, 7, model.TicketInitiatedByUser, model.TicketCategoryGeneral, model.TicketPriorityNormal,
		"s", "b, see attached", "cleanup-req-1", attachmentURL)
	require.NoError(t, err)

	runTicketAttachmentCleanupOnce()

	require.Empty(t, *deleted, "an upload referenced by a ticket message must never be deleted, regardless of age")
	var count int64
	require.NoError(t, model.DB.Model(&model.TicketAttachmentUpload{}).Where("storage_key = ?", "permanent/7/attached.png").Count(&count).Error)
	require.EqualValues(t, 1, count)
}

// TestRunTicketAttachmentCleanupOnceKeepsRecentUnreferencedUpload proves an
// upload still inside its retention window is left alone even if unattached
// yet, so a legitimate in-progress compose (upload just before submitting)
// is never raced by the sweep.
func TestRunTicketAttachmentCleanupOnceKeepsRecentUnreferencedUpload(t *testing.T) {
	setupTicketAttachmentCleanupTest(t)
	configureStorageForTest(t, 1, "https://storage.example.com", false)
	deleted := withStubbedTicketAttachmentDelete(t)

	mustInsertTicketAttachmentUpload(t, "permanent/7/fresh.png", 7, common.GetTimestamp())

	runTicketAttachmentCleanupOnce()

	require.Empty(t, *deleted)
	var count int64
	require.NoError(t, model.DB.Model(&model.TicketAttachmentUpload{}).Count(&count).Error)
	require.EqualValues(t, 1, count)
}

// TestRunTicketAttachmentCleanupOnceReleasesClaimOnDeleteFailure proves a
// transient storage delete failure doesn't leave the row permanently
// claimed: ClaimTicketAttachmentUploadForCleanup excludes claimed rows from
// TicketAttachmentKeysBelongToUploader, so a claim that's never released
// would make the key unusable forever even though the object was never
// actually deleted.
func TestRunTicketAttachmentCleanupOnceReleasesClaimOnDeleteFailure(t *testing.T) {
	setupTicketAttachmentCleanupTest(t)
	configureStorageForTest(t, 1, "https://storage.example.com", false)

	original := ticketAttachmentCleanupDeleteFunc
	t.Cleanup(func() { ticketAttachmentCleanupDeleteFunc = original })
	ticketAttachmentCleanupDeleteFunc = func(_ context.Context, _ model.TicketAttachmentUpload) error {
		return errors.New("simulated transient storage error")
	}

	old := common.GetTimestamp() - int64(ticketAttachmentOrphanRetention.Seconds()) - 3600
	upload := mustInsertTicketAttachmentUpload(t, "permanent/7/flaky.png", 7, old)

	runTicketAttachmentCleanupOnce()

	var reloaded model.TicketAttachmentUpload
	require.NoError(t, model.DB.First(&reloaded, upload.Id).Error, "the provenance row must survive a failed delete")
	require.Zero(t, reloaded.ClaimedAt, "a failed delete must release the claim so a later sweep can retry it")

	ok, err := model.TicketAttachmentKeysBelongToUploader([]string{"permanent/7/flaky.png"}, 7)
	require.NoError(t, err)
	require.True(t, ok, "the key must remain attachable after a failed delete releases the claim")
}

// TestRunTicketAttachmentCleanupOnceReclaimsRetainedPendingUpload covers the
// recovery half of the uncertain-put contract in UploadTicketAttachment: when
// an object put fails and the compensating delete also fails, the controller
// keeps the pending provenance row instead of releasing it. The orphan sweep
// must pick that row up after the retention window -- neither
// FindTicketAttachmentUploadsOlderThan nor
// ClaimTicketAttachmentUploadForCleanup may exclude pending rows -- delete the
// possibly-existing object idempotently, and remove the row. A second sweep
// must be a no-op.
func TestRunTicketAttachmentCleanupOnceReclaimsRetainedPendingUpload(t *testing.T) {
	setupTicketAttachmentCleanupTest(t)
	configureStorageForTest(t, 1, "https://storage.example.com", false)
	deleted := withStubbedTicketAttachmentDelete(t)

	old := common.GetTimestamp() - int64(ticketAttachmentOrphanRetention.Seconds()) - 3600
	publicID := uuid.NewString()
	row := model.TicketAttachmentUpload{
		PublicId:       &publicID,
		OriginalName:   "stuck.png",
		StorageKey:     "resource/tickets/7/stuck.png",
		UploaderUserId: 7,
		CreatedAt:      old,
		Pending:        true,
	}
	require.NoError(t, model.DB.Create(&row).Error)

	runTicketAttachmentCleanupOnce()

	require.Equal(t, []string{"resource/tickets/7/stuck.png"}, *deleted,
		"a pending row retained after an uncertain put must be claimed and its object deleted")
	var count int64
	require.NoError(t, model.DB.Model(&model.TicketAttachmentUpload{}).Count(&count).Error)
	require.Zero(t, count, "the retained pending row must be removed once the object delete succeeded")

	runTicketAttachmentCleanupOnce()

	require.Len(t, *deleted, 1, "a second sweep over the already-reclaimed upload must be a no-op")
	require.NoError(t, model.DB.Model(&model.TicketAttachmentUpload{}).Count(&count).Error)
	require.Zero(t, count)
}

func TestRunTicketAttachmentCleanupOnceDoesNotDependOnCurrentStorageConfig(t *testing.T) {
	setupTicketAttachmentCleanupTest(t)
	deleted := withStubbedTicketAttachmentDelete(t)

	old := common.GetTimestamp() - int64(ticketAttachmentOrphanRetention.Seconds()) - 3600
	mustInsertTicketAttachmentUpload(t, "permanent/7/orphan.png", 7, old)

	runTicketAttachmentCleanupOnce()

	require.Equal(t, []string{"permanent/7/orphan.png"}, *deleted,
		"cleanup must use each row's placement instead of the active storage switch")
	var count int64
	require.NoError(t, model.DB.Model(&model.TicketAttachmentUpload{}).Count(&count).Error)
	require.Zero(t, count)
}
