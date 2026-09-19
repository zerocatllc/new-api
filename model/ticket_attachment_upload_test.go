package model

import (
	"fmt"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/setting/storage_setting"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func recordReadyTicketAttachmentUpload(storageKey string, uploaderUserID int) error {
	return DB.Create(&TicketAttachmentUpload{
		StorageKey:     storageKey,
		UploaderUserId: uploaderUserID,
		CreatedAt:      common.GetTimestamp(),
	}).Error
}

func testTicketAttachmentPlacement() TicketAttachmentStoragePlacement {
	return TicketAttachmentStoragePlacement{
		Version: 1,
		Location: storage_setting.StorageLocation{
			Endpoint:      "https://storage.example.com",
			Bucket:        "tickets",
			AccessKeyID:   "access",
			PublicBaseURL: "https://assets.example.com",
		},
		SecretCiphertext: "encrypted-secret",
	}
}

func TestStorageQuotaAdmissionAndReservationAreAtomic(t *testing.T) {
	setupTicketDB(t)
	require.NoError(t, DB.Create(&User{Id: 7, Username: "quota-user", Status: common.UserStatusEnabled}).Error)
	rows := make([]TicketAttachmentUpload, 0, MaxUserStorageFiles-1)
	size := int64(1)
	for i := 0; i < MaxUserStorageFiles-1; i++ {
		rows = append(rows, TicketAttachmentUpload{
			StorageKey:     fmt.Sprintf("tickets/7/existing-%d.txt", i),
			UploaderUserId: 7,
			CreatedAt:      common.GetTimestamp(),
			SizeBytes:      &size,
		})
	}
	require.NoError(t, DB.CreateInBatches(rows, 100).Error)

	_, err := ReserveTicketAttachmentUpload("tickets/7/concurrent-a.txt", "concurrent-a.txt", 7, 1, "text/plain", testTicketAttachmentPlacement())
	require.NoError(t, err)
	_, err = ReserveTicketAttachmentUpload("tickets/7/concurrent-b.txt", "concurrent-b.txt", 7, 1, "text/plain", testTicketAttachmentPlacement())
	require.ErrorIs(t, err, ErrStorageQuotaExceeded)
	fileCount, _, err := GetUserTicketAttachmentUsage(7)
	require.NoError(t, err)
	require.LessOrEqual(t, fileCount, int64(MaxUserStorageFiles), "quota reservations must not overshoot the ceiling")
}

func TestPendingAttachmentReservationCannotBeBoundBeforeObjectPutCompletes(t *testing.T) {
	setupTicketDB(t)
	require.NoError(t, DB.Create(&User{Id: 7, Username: "pending-user", Status: common.UserStatusEnabled}).Error)
	const key = "tickets/7/pending.txt"
	_, err := ReserveTicketAttachmentUpload(key, "pending.txt", 7, 1, "text/plain", testTicketAttachmentPlacement())
	require.NoError(t, err)

	owned, err := TicketAttachmentKeysBelongToUploader([]string{key}, 7)
	require.NoError(t, err)
	require.False(t, owned, "a quota reservation must not become attachment provenance before the object put succeeds")

	require.NoError(t, MarkTicketAttachmentUploadReady(key, 7))
	owned, err = TicketAttachmentKeysBelongToUploader([]string{key}, 7)
	require.NoError(t, err)
	require.True(t, owned)
	require.Error(t, ReleaseTicketAttachmentUploadReservation(key, 7), "the failure path must never delete a ready upload")
}

func TestTicketAttachmentReferenceUsesPersistedLocationAfterConfigSwitch(t *testing.T) {
	setupTicketDB(t)
	publicID := "492ae31e-e0f6-4df2-b5a1-4d731d7e9048"
	version := int64(1)
	locationJSON, err := common.Marshal(storage_setting.StorageLocation{PublicBaseURL: "https://old.example.com/files"})
	require.NoError(t, err)
	location := string(locationJSON)
	ciphertext := "encrypted"
	upload := TicketAttachmentUpload{
		PublicId:                &publicID,
		OriginalName:            "report.txt",
		StorageKey:              "permanent/7/report.txt",
		UploaderUserId:          7,
		CreatedAt:               common.GetTimestamp(),
		StorageConfigVersion:    &version,
		StorageLocationJson:     &location,
		StorageSecretCiphertext: &ciphertext,
	}
	require.NoError(t, DB.Create(&upload).Error)
	storage_setting.ApplySavedSettings(storage_setting.StorageSettings{
		Version:  2,
		Location: storage_setting.StorageLocation{PublicBaseURL: "https://new.example.com/files"},
	}, "", false, false)
	t.Cleanup(func() {
		storage_setting.ApplySavedSettings(storage_setting.StorageSettings{}, "", false, false)
	})

	resolved, err := FindTicketAttachmentUploadByReference(upload.Reference())
	require.NoError(t, err)
	require.Equal(t, upload.StorageKey, resolved.StorageKey)
	_, err = FindTicketAttachmentUploadByReference(TicketAttachmentReference(publicID, "spoofed.txt"))
	require.ErrorIs(t, err, gorm.ErrRecordNotFound)
	resolved, err = FindTicketAttachmentUploadByReference("https://old.example.com/files/permanent/7/report.txt")
	require.NoError(t, err)
	require.Equal(t, upload.StorageKey, resolved.StorageKey)
	_, err = FindTicketAttachmentUploadByReference("https://new.example.com/files/permanent/7/report.txt")
	require.ErrorIs(t, err, gorm.ErrRecordNotFound)
}

func TestBackfillLegacyTicketAttachmentStorageSnapshots(t *testing.T) {
	setupTicketDB(t)
	require.NoError(t, DB.AutoMigrate(&Option{}))
	require.NoError(t, DB.Create(&TicketAttachmentUpload{
		StorageKey:     "permanent/7/legacy.txt",
		UploaderUserId: 7,
		CreatedAt:      common.GetTimestamp(),
	}).Error)
	require.NoError(t, DB.Create(&Option{Key: OptionStorageSecretAccessKey, Value: "v1:ciphertext"}).Error)
	storage_setting.ApplySavedSettings(storage_setting.StorageSettings{
		Version: 9,
		Location: storage_setting.StorageLocation{
			Endpoint:      "https://storage.example.com",
			Bucket:        "legacy-bucket",
			AccessKeyID:   "legacy-access",
			PublicBaseURL: "https://assets.example.com",
		},
	}, "", false, false)
	t.Cleanup(func() {
		storage_setting.ApplySavedSettings(storage_setting.StorageSettings{}, "", false, false)
	})

	require.NoError(t, BackfillTicketAttachmentPublicIDs())
	require.NoError(t, BackfillLegacyTicketAttachmentStorageSnapshots())

	var upload TicketAttachmentUpload
	require.NoError(t, DB.First(&upload).Error)
	require.NotNil(t, upload.PublicId)
	require.Equal(t, int64(9), *upload.StorageConfigVersion)
	require.Equal(t, "v1:ciphertext", *upload.StorageSecretCiphertext)
	placement, err := upload.StoragePlacement()
	require.NoError(t, err)
	require.Equal(t, "legacy-bucket", placement.Location.Bucket)
}

func TestTicketAttachmentKeysBelongToUploaderRequiresExactUploaderMatch(t *testing.T) {
	setupTicketDB(t)

	require.NoError(t, recordReadyTicketAttachmentUpload("tickets/7/a.png", 7))
	require.NoError(t, recordReadyTicketAttachmentUpload("tickets/7/b.png", 7))

	ok, err := TicketAttachmentKeysBelongToUploader([]string{"tickets/7/a.png", "tickets/7/b.png"}, 7)
	require.NoError(t, err)
	require.True(t, ok)

	ok, err = TicketAttachmentKeysBelongToUploader([]string{"tickets/7/a.png"}, 8)
	require.NoError(t, err, "a different uploader must not be granted access via someone else's upload")
	require.False(t, ok)

	ok, err = TicketAttachmentKeysBelongToUploader([]string{"tickets/999/never-uploaded.png"}, 7)
	require.NoError(t, err, "a key with no upload record at all must fail, not error")
	require.False(t, ok)

	ok, err = TicketAttachmentKeysBelongToUploader(nil, 7)
	require.NoError(t, err)
	require.True(t, ok, "no keys to check trivially passes")
}

func TestTicketAttachmentKeysBelongToUploaderRejectsPartialMatch(t *testing.T) {
	setupTicketDB(t)

	require.NoError(t, recordReadyTicketAttachmentUpload("tickets/7/mine.png", 7))
	require.NoError(t, recordReadyTicketAttachmentUpload("tickets/8/not-mine.png", 8))

	ok, err := TicketAttachmentKeysBelongToUploader([]string{"tickets/7/mine.png", "tickets/8/not-mine.png"}, 7)
	require.NoError(t, err)
	require.False(t, ok, "one foreign key among several must fail the whole batch")
}

// TestClaimTicketAttachmentUploadForCleanupFailsWhenReferenced proves the
// claim's reference check is folded into the same atomic statement as the
// claim itself: a key already attached to a ticket message can never be
// claimed, no matter how old its upload row is.
func TestClaimTicketAttachmentUploadForCleanupFailsWhenReferenced(t *testing.T) {
	setupTicketDB(t)
	upload := mustCreateTicketAttachmentUploadForTest(t, "tickets/7/attached.png", 7)
	mustCreateTicketWithAttachment(t, 7, "tickets/7/attached.png")

	claimed, err := ClaimTicketAttachmentUploadForCleanup(upload.Id, upload.StorageKey, common.GetTimestamp())
	require.NoError(t, err)
	require.False(t, claimed, "a key referenced by a ticket message must never be claimable for deletion")

	var reloaded TicketAttachmentUpload
	require.NoError(t, DB.First(&reloaded, upload.Id).Error)
	require.Zero(t, reloaded.ClaimedAt)
}

// TestClaimTicketAttachmentUploadForCleanupIsExclusive proves two claim
// attempts on the same unreferenced row cannot both win: this is what
// prevents the cleanup worker from double-processing (and double-deleting)
// the same storage object.
func TestClaimTicketAttachmentUploadForCleanupIsExclusive(t *testing.T) {
	setupTicketDB(t)
	upload := mustCreateTicketAttachmentUploadForTest(t, "tickets/7/orphan.png", 7)

	now := common.GetTimestamp()
	claimed, err := ClaimTicketAttachmentUploadForCleanup(upload.Id, upload.StorageKey, now)
	require.NoError(t, err)
	require.True(t, claimed)

	claimedAgain, err := ClaimTicketAttachmentUploadForCleanup(upload.Id, upload.StorageKey, now)
	require.NoError(t, err)
	require.False(t, claimedAgain, "a row already claimed must not be claimable a second time")
}

// TestClaimTicketAttachmentUploadForCleanupReclaimsStaleClaim is the
// crash-recovery regression test: if the cleanup worker crashes between
// winning a claim and either deleting the row or releasing the claim on
// failure, the row must not stay claimed (and thus permanently unusable)
// forever.
func TestClaimTicketAttachmentUploadForCleanupReclaimsStaleClaim(t *testing.T) {
	setupTicketDB(t)
	upload := mustCreateTicketAttachmentUploadForTest(t, "tickets/7/orphan.png", 7)

	now := common.GetTimestamp()
	claimed, err := ClaimTicketAttachmentUploadForCleanup(upload.Id, upload.StorageKey, now)
	require.NoError(t, err)
	require.True(t, claimed)

	tooSoon, err := ClaimTicketAttachmentUploadForCleanup(upload.Id, upload.StorageKey, now+ticketAttachmentCleanupClaimStale-1)
	require.NoError(t, err)
	require.False(t, tooSoon, "a live claim must not be stolen before it goes stale")

	afterStale, err := ClaimTicketAttachmentUploadForCleanup(upload.Id, upload.StorageKey, now+ticketAttachmentCleanupClaimStale+1)
	require.NoError(t, err)
	require.True(t, afterStale, "a stale claim (crashed worker) must be reclaimable so the row is not stuck forever")
}

// TestTicketAttachmentKeysBelongToUploaderExcludesActiveClaim is the
// regression test for the check-then-delete race a second reviewer flagged:
// service/ticket_attachment_cleanup_worker.go used to check
// "unreferenced" and then delete the storage object with no atomicity, so a
// concurrent ticket message could attach the key in between and end up
// pointing at a deleted object. Once the cleanup worker holds a claim on a
// key, any attempt to attach that key to a new message (validated through
// this function, see controller.validateTicketAttachmentUrlsBelongToCaller)
// must be rejected -- closing the race on the write side, since the claim
// window itself can't be made atomic with an out-of-process storage delete
// call.
func TestTicketAttachmentKeysBelongToUploaderExcludesActiveClaim(t *testing.T) {
	setupTicketDB(t)
	upload := mustCreateTicketAttachmentUploadForTest(t, "tickets/7/racy.png", 7)

	ok, err := TicketAttachmentKeysBelongToUploader([]string{"tickets/7/racy.png"}, 7)
	require.NoError(t, err)
	require.True(t, ok, "an unclaimed key uploaded by the caller must be usable")

	now := common.GetTimestamp()
	claimed, err := ClaimTicketAttachmentUploadForCleanup(upload.Id, upload.StorageKey, now)
	require.NoError(t, err)
	require.True(t, claimed)

	ok, err = TicketAttachmentKeysBelongToUploader([]string{"tickets/7/racy.png"}, 7)
	require.NoError(t, err)
	require.False(t, ok, "a key currently claimed by the cleanup worker must not be attachable, or a new message could end up referencing an object the worker is about to delete")

	require.NoError(t, ReleaseTicketAttachmentUploadClaim(upload.Id, now))
	ok, err = TicketAttachmentKeysBelongToUploader([]string{"tickets/7/racy.png"}, 7)
	require.NoError(t, err)
	require.True(t, ok, "releasing the claim (e.g. after a failed storage delete) must make the key usable again")
}

func TestStaleAttachmentCleanupOwnerCannotReleaseOrDeleteNewClaim(t *testing.T) {
	setupTicketDB(t)
	upload := mustCreateTicketAttachmentUploadForTest(t, "tickets/7/fenced.png", 7)
	oldClaim := common.GetTimestamp()
	claimed, err := ClaimTicketAttachmentUploadForCleanup(upload.Id, upload.StorageKey, oldClaim)
	require.NoError(t, err)
	require.True(t, claimed)

	newClaim := oldClaim + ticketAttachmentCleanupClaimStale + 1
	claimed, err = ClaimTicketAttachmentUploadForCleanup(upload.Id, upload.StorageKey, newClaim)
	require.NoError(t, err)
	require.True(t, claimed)

	require.ErrorIs(t, ReleaseTicketAttachmentUploadClaim(upload.Id, oldClaim), errTicketAttachmentCleanupClaimLost)
	require.ErrorIs(t, DeleteTicketAttachmentUpload(upload.Id, upload.StorageKey, oldClaim), errTicketAttachmentCleanupClaimLost)

	var reloaded TicketAttachmentUpload
	require.NoError(t, DB.First(&reloaded, upload.Id).Error)
	require.Equal(t, newClaim, reloaded.ClaimedAt, "an old worker must not clear or finalize the replacement worker's claim")
}

func mustCreateTicketAttachmentUploadForTest(t *testing.T, key string, uploaderUserID int) TicketAttachmentUpload {
	t.Helper()
	upload := TicketAttachmentUpload{StorageKey: key, UploaderUserId: uploaderUserID, CreatedAt: common.GetTimestamp()}
	require.NoError(t, DB.Create(&upload).Error)
	return upload
}

func mustCreateTicketWithAttachment(t *testing.T, userID int, storageKey string) {
	t.Helper()
	withTicketAttachmentStorageBaseForTest(t, "https://storage.example.com")
	_, _, err := CreateTicket(userID, userID, TicketInitiatedByUser, TicketCategoryGeneral, TicketPriorityNormal,
		"s", "b, see attached", "attach-req-"+storageKey, "https://storage.example.com/"+storageKey)
	require.NoError(t, err)
}

// TestTicketAttachmentKeysBelongToUploaderRejectsStaleClaim locks in the
// binding-side rule that a claim blocks attachment forever, not just for
// ticketAttachmentCleanupClaimStale: a stale claim means the cleanup worker
// may have deleted the storage object and crashed before removing this row,
// so treating the key as bindable again would attach a message to an object
// that no longer exists. Only ClaimTicketAttachmentUploadForCleanup may act
// on staleness (covered by TestClaimTicketAttachmentUploadForCleanupReclaimsStaleClaim).
func TestTicketAttachmentKeysBelongToUploaderRejectsStaleClaim(t *testing.T) {
	setupTicketDB(t)
	upload := mustCreateTicketAttachmentUploadForTest(t, "tickets/7/stale.png", 7)
	staleClaim := common.GetTimestamp() - ticketAttachmentCleanupClaimStale - 1
	require.NoError(t, DB.Model(&TicketAttachmentUpload{}).Where("id = ?", upload.Id).Update("claimed_at", staleClaim).Error)

	ok, err := TicketAttachmentKeysBelongToUploader([]string{"tickets/7/stale.png"}, 7)
	require.NoError(t, err)
	require.False(t, ok, "a stale claim may sit between a completed storage delete and a crashed row delete; binding must not resurrect the key")

	err = DB.Transaction(func(tx *gorm.DB) error {
		txOK, txErr := claimTicketAttachmentUploadsForMessage(tx, []string{"tickets/7/stale.png"}, 7)
		require.NoError(t, txErr)
		require.False(t, txOK, "the in-transaction re-check must apply the same stale-claim rejection as the pre-check")
		return nil
	})
	require.NoError(t, err)
}

func TestRetentionClaimBlocksReopenUntilObjectDeletionFinishes(t *testing.T) {
	setupTicketDB(t)
	withTicketAttachmentStorageBaseForTest(t, "https://storage.example.com")
	upload := mustCreateTicketAttachmentUploadForTest(t, "tickets/7/retained.png", 7)
	ticket, _, err := CreateTicket(7, 7, TicketInitiatedByUser, TicketCategoryGeneral, TicketPriorityNormal,
		"retention", "attachment", "retention-reopen", "https://storage.example.com/"+upload.StorageKey)
	require.NoError(t, err)
	ticket, err = ResolveTicket(ticket.PublicId, TicketAuthorKindUser, ticket.Version)
	require.NoError(t, err)

	cutoff := common.GetTimestamp() - 3600
	require.NoError(t, DB.Model(&Ticket{}).Where("id = ?", ticket.Id).Updates(map[string]interface{}{
		"resolved_at":                     cutoff - 1,
		"attachment_retention_claim_id":   nil,
		"attachment_retention_claimed_at": nil,
	}).Error)
	claimed, err := ClaimTicketAttachmentUploadForRetention(upload.Id, upload.StorageKey, common.GetTimestamp(), cutoff)
	require.NoError(t, err)
	require.True(t, claimed)

	_, err = ReopenTicket(ticket.PublicId, TicketAuthorKindUser, ticket.Version)
	require.Error(t, err, "a ticket must not reopen while its attachment is claimed for deletion")
	var reloaded Ticket
	require.NoError(t, DB.First(&reloaded, ticket.Id).Error)
	require.Equal(t, TicketStatusResolved, reloaded.Status)
}

func TestRetentionClaimBlocksReplyThatWouldReopenTicket(t *testing.T) {
	setupTicketDB(t)
	withTicketAttachmentStorageBaseForTest(t, "https://storage.example.com")
	upload := mustCreateTicketAttachmentUploadForTest(t, "tickets/7/reply.png", 7)
	ticket, _, err := CreateTicket(7, 7, TicketInitiatedByUser, TicketCategoryGeneral, TicketPriorityNormal,
		"retention", "attachment", "retention-reply", "https://storage.example.com/"+upload.StorageKey)
	require.NoError(t, err)
	ticket, err = ResolveTicket(ticket.PublicId, TicketAuthorKindUser, ticket.Version)
	require.NoError(t, err)

	cutoff := common.GetTimestamp() - 3600
	require.NoError(t, DB.Model(&Ticket{}).Where("id = ?", ticket.Id).Update("resolved_at", cutoff-1).Error)
	claimed, err := ClaimTicketAttachmentUploadForRetention(upload.Id, upload.StorageKey, common.GetTimestamp(), cutoff)
	require.NoError(t, err)
	require.True(t, claimed)

	_, _, err = ReplyToTicket(ticket.PublicId, 7, TicketAuthorKindUser, TicketVisibilityPublic, "reopen by reply", "retention-reply-after-claim")
	require.Error(t, err, "a reply must not reopen a ticket while retention deletion is in flight")
}

func TestReopenBeforeRetentionClaimPreventsClaim(t *testing.T) {
	setupTicketDB(t)
	withTicketAttachmentStorageBaseForTest(t, "https://storage.example.com")
	upload := mustCreateTicketAttachmentUploadForTest(t, "tickets/7/reopen-first.png", 7)
	ticket, _, err := CreateTicket(7, 7, TicketInitiatedByUser, TicketCategoryGeneral, TicketPriorityNormal,
		"retention", "attachment", "retention-reopen-first", "https://storage.example.com/"+upload.StorageKey)
	require.NoError(t, err)
	ticket, err = ResolveTicket(ticket.PublicId, TicketAuthorKindUser, ticket.Version)
	require.NoError(t, err)
	cutoff := common.GetTimestamp() - 3600
	require.NoError(t, DB.Model(&Ticket{}).Where("id = ?", ticket.Id).Update("resolved_at", cutoff-1).Error)

	ticket, err = ReopenTicket(ticket.PublicId, TicketAuthorKindUser, ticket.Version)
	require.NoError(t, err)
	require.Equal(t, TicketStatusOpen, ticket.Status)
	claimed, err := ClaimTicketAttachmentUploadForRetention(upload.Id, upload.StorageKey, common.GetTimestamp(), cutoff)
	require.NoError(t, err)
	require.False(t, claimed, "a completed reopen must atomically defeat the later retention claim")
}

func TestRetentionFinalizationRemovesDeletedReferencesBeforeReopen(t *testing.T) {
	setupTicketDB(t)
	withTicketAttachmentStorageBaseForTest(t, "https://storage.example.com")
	upload := mustCreateTicketAttachmentUploadForTest(t, "tickets/7/finalize.png", 7)
	ticket, message, err := CreateTicket(7, 7, TicketInitiatedByUser, TicketCategoryGeneral, TicketPriorityNormal,
		"retention", "attachment", "retention-finalize", "https://storage.example.com/"+upload.StorageKey)
	require.NoError(t, err)
	ticket, err = ResolveTicket(ticket.PublicId, TicketAuthorKindUser, ticket.Version)
	require.NoError(t, err)
	cutoff := common.GetTimestamp() - 3600
	require.NoError(t, DB.Model(&Ticket{}).Where("id = ?", ticket.Id).Update("resolved_at", cutoff-1).Error)

	claimToken := common.GetTimestamp()
	claimed, err := ClaimTicketAttachmentUploadForRetention(upload.Id, upload.StorageKey, claimToken, cutoff)
	require.NoError(t, err)
	require.True(t, claimed)
	require.NoError(t, FinalizeTicketAttachmentRetention(upload.Id, upload.StorageKey, claimToken))

	ticket, err = ReopenTicket(ticket.PublicId, TicketAuthorKindUser, ticket.Version)
	require.NoError(t, err)
	require.Equal(t, TicketStatusOpen, ticket.Status)
	var reloadedMessage TicketMessage
	require.NoError(t, DB.First(&reloadedMessage, message.Id).Error)
	require.Empty(t, reloadedMessage.DecodedAttachmentUrls())
	require.ErrorIs(t, DB.First(&TicketAttachmentUpload{}, upload.Id).Error, gorm.ErrRecordNotFound)
}

func TestRetentionReleaseRestoresTicketMutationAfterDeleteFailure(t *testing.T) {
	setupTicketDB(t)
	withTicketAttachmentStorageBaseForTest(t, "https://storage.example.com")
	upload := mustCreateTicketAttachmentUploadForTest(t, "tickets/7/release.png", 7)
	ticket, _, err := CreateTicket(7, 7, TicketInitiatedByUser, TicketCategoryGeneral, TicketPriorityNormal,
		"retention", "attachment", "retention-release", "https://storage.example.com/"+upload.StorageKey)
	require.NoError(t, err)
	ticket, err = ResolveTicket(ticket.PublicId, TicketAuthorKindUser, ticket.Version)
	require.NoError(t, err)
	cutoff := common.GetTimestamp() - 3600
	require.NoError(t, DB.Model(&Ticket{}).Where("id = ?", ticket.Id).Update("resolved_at", cutoff-1).Error)

	claimToken := common.GetTimestamp()
	claimed, err := ClaimTicketAttachmentUploadForRetention(upload.Id, upload.StorageKey, claimToken, cutoff)
	require.NoError(t, err)
	require.True(t, claimed)
	require.NoError(t, ReleaseTicketAttachmentRetentionClaim(upload.Id, claimToken))

	ticket, err = ReopenTicket(ticket.PublicId, TicketAuthorKindUser, ticket.Version)
	require.NoError(t, err)
	require.Equal(t, TicketStatusOpen, ticket.Status)
}

// TestTicketAttachmentReferenceWithAmpersandSurvivesLookupAndCleanup is the
// regression test for names containing '&': the stored attachment_urls JSON
// carries the HTML-escaped form, so LIKE patterns built from the raw
// reference used to miss it -- downloads failed and cleanup treated the
// referenced object as an orphan.
func TestTicketAttachmentReferenceWithAmpersandSurvivesLookupAndCleanup(t *testing.T) {
	setupTicketDB(t)
	publicID := "3f2e9a44-6d1c-4a5b-9e2f-8c7d6b5a4e3d"
	upload := TicketAttachmentUpload{
		StorageKey:     "tickets/7/amp.png",
		UploaderUserId: 7,
		CreatedAt:      common.GetTimestamp(),
		PublicId:       &publicID,
		OriginalName:   "a&b.png",
	}
	require.NoError(t, DB.Create(&upload).Error)
	reference := upload.Reference()
	require.Contains(t, reference, "&")

	_, _, err := CreateTicket(7, 7, TicketInitiatedByUser, TicketCategoryGeneral, TicketPriorityNormal, "s", "b, see attached", "amp-req", reference)
	require.NoError(t, err)

	found, err := FindTicketMessageByAttachmentURL(reference)
	require.NoError(t, err)
	require.NotNil(t, found)

	ownerMessage, err := FindPublicTicketMessageByAttachmentURLForOwner(reference, 7)
	require.NoError(t, err)
	require.NotNil(t, ownerMessage)

	claimed, err := ClaimTicketAttachmentUploadForCleanup(upload.Id, upload.StorageKey, common.GetTimestamp())
	require.NoError(t, err)
	require.False(t, claimed, "a referenced attachment whose name contains '&' must not be claimable for deletion")
}

// TestRetentionClaimDetectsBindingCommittedAfterEnumeration is the regression
// test for the retention TOCTOU: a binder that commits a new reference after
// the claim's pre-claim enumeration but before the upload row claim must
// defeat the claim, otherwise the worker would delete an object a live open
// ticket still references and finalization would erase that reference.
func TestRetentionClaimDetectsBindingCommittedAfterEnumeration(t *testing.T) {
	setupTicketDB(t)
	withTicketAttachmentStorageBaseForTest(t, "https://storage.example.com")
	upload := mustCreateTicketAttachmentUploadForTest(t, "tickets/7/raced.png", 7)
	reference := "https://storage.example.com/" + upload.StorageKey

	resolved, _, err := CreateTicket(7, 7, TicketInitiatedByUser, TicketCategoryGeneral, TicketPriorityNormal,
		"retention", "attachment", "retention-race-resolved", reference)
	require.NoError(t, err)
	resolved, err = ResolveTicket(resolved.PublicId, TicketAuthorKindUser, resolved.Version)
	require.NoError(t, err)
	cutoff := common.GetTimestamp() - 3600
	require.NoError(t, DB.Model(&Ticket{}).Where("id = ?", resolved.Id).Update("resolved_at", cutoff-1).Error)

	openTicket, openMessage, err := CreateTicket(7, 7, TicketInitiatedByUser, TicketCategoryGeneral, TicketPriorityNormal,
		"retention", "late binding", "retention-race-open")
	require.NoError(t, err)
	require.Equal(t, TicketStatusOpen, openTicket.Status)

	encoded, err := encodeTicketAttachmentUrls([]string{reference})
	require.NoError(t, err)
	ticketAttachmentRetentionClaimBarrier = func(tx *gorm.DB) error {
		return tx.Model(&TicketMessage{}).Where("id = ?", openMessage.Id).Update("attachment_urls", encoded).Error
	}
	t.Cleanup(func() { ticketAttachmentRetentionClaimBarrier = nil })

	claimed, err := ClaimTicketAttachmentUploadForRetention(upload.Id, upload.StorageKey, common.GetTimestamp(), cutoff)
	require.NoError(t, err)
	require.False(t, claimed, "a reference bound after enumeration must defeat the retention claim")

	var reloadedUpload TicketAttachmentUpload
	require.NoError(t, DB.First(&reloadedUpload, upload.Id).Error)
	require.Zero(t, reloadedUpload.ClaimedAt, "a defeated claim must leave the upload row unclaimed")
	var reloadedResolved Ticket
	require.NoError(t, DB.First(&reloadedResolved, resolved.Id).Error)
	require.Zero(t, reloadedResolved.AttachmentRetentionClaimId, "a defeated claim must roll back its ticket claims")
}

// TestRetentionFinalizeRefusesReferenceOutsideClaimedTickets locks in the
// finalize-side defense: removing a deleted object's URL is only legal on
// tickets this claim actually covered. A real reference on any other ticket
// means claim-time verification was defeated, and finalization must fail
// loudly instead of silently destroying a live ticket's attachment link.
func TestRetentionFinalizeRefusesReferenceOutsideClaimedTickets(t *testing.T) {
	setupTicketDB(t)
	withTicketAttachmentStorageBaseForTest(t, "https://storage.example.com")
	upload := mustCreateTicketAttachmentUploadForTest(t, "tickets/7/outside.png", 7)
	reference := "https://storage.example.com/" + upload.StorageKey

	resolved, _, err := CreateTicket(7, 7, TicketInitiatedByUser, TicketCategoryGeneral, TicketPriorityNormal,
		"retention", "attachment", "retention-outside-resolved", reference)
	require.NoError(t, err)
	resolved, err = ResolveTicket(resolved.PublicId, TicketAuthorKindUser, resolved.Version)
	require.NoError(t, err)
	cutoff := common.GetTimestamp() - 3600
	require.NoError(t, DB.Model(&Ticket{}).Where("id = ?", resolved.Id).Update("resolved_at", cutoff-1).Error)

	claimToken := common.GetTimestamp()
	claimed, err := ClaimTicketAttachmentUploadForRetention(upload.Id, upload.StorageKey, claimToken, cutoff)
	require.NoError(t, err)
	require.True(t, claimed)

	_, openMessage, err := CreateTicket(7, 7, TicketInitiatedByUser, TicketCategoryGeneral, TicketPriorityNormal,
		"retention", "late binding", "retention-outside-open")
	require.NoError(t, err)
	encoded, err := encodeTicketAttachmentUrls([]string{reference})
	require.NoError(t, err)
	require.NoError(t, DB.Model(&TicketMessage{}).Where("id = ?", openMessage.Id).Update("attachment_urls", encoded).Error)

	err = FinalizeTicketAttachmentRetention(upload.Id, upload.StorageKey, claimToken)
	require.Error(t, err, "finalize must refuse to erase a reference on a ticket outside the claim")
	var survivor TicketMessage
	require.NoError(t, DB.First(&survivor, openMessage.Id).Error)
	require.Equal(t, []string{reference}, survivor.DecodedAttachmentUrls())
}
