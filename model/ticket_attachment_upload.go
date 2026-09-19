package model

import (
	"errors"
	"fmt"
	"net/url"
	"path"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/setting/storage_setting"
	"github.com/google/uuid"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// ticketAttachmentCleanupClaimStale bounds how long a
// ClaimTicketAttachmentUploadForCleanup claim blocks a later cleanup sweep
// from re-taking the row. It exists for the case a normal claim-then-delete
// cycle doesn't cover: the worker process crashing between winning the claim
// and either deleting the row or releasing the claim on failure, which would
// otherwise leave the row claimed -- and therefore unreclaimable -- forever.
// Only the cleanup worker honors staleness: message binding rejects any
// claimed row regardless of age, because a stale claim may mean the storage
// object was already deleted before the crash. It is generous compared to
// how long a single storage delete call should ever take, so a live
// in-flight claim is never prematurely stolen.
const ticketAttachmentCleanupClaimStale = 10 * 60 // seconds

var (
	errTicketAttachmentRetentionClaimLost = errors.New("attachment retention claim lost")
	errTicketAttachmentCleanupClaimLost   = errors.New("attachment cleanup claim lost")
	ErrStorageQuotaExceeded               = errors.New("ticket attachment storage quota exceeded")
)

// ticketAttachmentRetentionClaimBarrier is a test-only injection point invoked
// inside ClaimTicketAttachmentUploadForRetention between the initial reference
// enumeration and the claim writes. Tests use it to commit a concurrent
// binding at exactly the point the pre-claim enumeration can no longer see it,
// which cannot be scheduled deterministically from outside the transaction.
var ticketAttachmentRetentionClaimBarrier func(tx *gorm.DB) error

// TicketAttachmentUpload records who uploaded a storage key, so ticket
// create/reply requests can be validated against actual upload provenance
// instead of trusting any storage-domain URL the client happens to submit.
// Without this binding, a caller could reference an arbitrary object under
// the shared storage bucket in their own ticket message — the ticket
// ownership check at download time only proves the caller owns the
// *referencing* ticket, not that they uploaded the *referenced* object — and
// use it as an arbitrary-object-read primitive via the presigned-download
// endpoint.
type TicketAttachmentUpload struct {
	Id             int64   `json:"id" gorm:"primaryKey"`
	PublicId       *string `json:"-" gorm:"type:char(36);uniqueIndex"`
	OriginalName   string  `json:"-" gorm:"type:varchar(255)"`
	StorageKey     string  `json:"storage_key" gorm:"type:varchar(512);uniqueIndex"`
	UploaderUserId int     `json:"uploader_user_id" gorm:"index"`
	CreatedAt      int64   `json:"created_at"`
	// The placement snapshot is immutable object provenance. It prevents a
	// later endpoint, bucket, credential, or public-base change from silently
	// redirecting download and cleanup operations to the new location.
	StorageConfigVersion    *int64  `json:"-"`
	StorageLocationJson     *string `json:"-" gorm:"type:text"`
	StorageSecretCiphertext *string `json:"-" gorm:"type:text"`
	// SizeBytes and ContentType are recorded at upload time to power per-user
	// storage usage accounting and quota enforcement. They are pointers so
	// rows written before these columns existed stay NULL rather than
	// masquerading as a real 0-byte/empty upload -- usage aggregation counts
	// NULL-size rows separately (as "unknown") instead of summing them as 0,
	// which would silently understate historical usage.
	SizeBytes   *int64  `json:"size_bytes"`
	ContentType *string `json:"content_type" gorm:"type:varchar(255)"`
	// Pending is true between quota reservation and a successful object put.
	// Existing rows migrate to false, so previously uploaded objects remain
	// usable. Message binding rejects pending rows; orphan cleanup reclaims a
	// crashed reservation after the normal retention interval.
	Pending bool `json:"-" gorm:"not null;index"`
	// ClaimedAt is non-zero while the cleanup worker holds an exclusive claim
	// on this row between confirming it is unreferenced and actually deleting
	// the storage object (see ClaimTicketAttachmentUploadForCleanup). It
	// closes the check-then-delete race: without it, a message could attach
	// this key in the gap between the worker's reference check and its
	// storage delete call, leaving that message pointing at a deleted object.
	// TicketAttachmentKeysBelongToUploader treats a claimed key as not owned,
	// so an attach attempt made while the claim is held is rejected rather
	// than racing the delete.
	ClaimedAt int64 `json:"claimed_at"`
}

// TicketAttachmentStoragePlacement is captured once before an upload starts
// and persisted with its provenance row in the quota transaction.
type TicketAttachmentStoragePlacement struct {
	Version          int64
	Location         storage_setting.StorageLocation
	SecretCiphertext string
}

const ticketAttachmentReferencePrefix = "/ticket-attachments/"

func TicketAttachmentReference(publicID, originalName string) string {
	return ticketAttachmentReferencePrefix + publicID + "/" + url.PathEscape(path.Base(originalName))
}

func ticketAttachmentReferencePublicID(reference string) (string, bool) {
	if !strings.HasPrefix(reference, ticketAttachmentReferencePrefix) {
		return "", false
	}
	rest := strings.TrimPrefix(reference, ticketAttachmentReferencePrefix)
	publicID, _, ok := strings.Cut(rest, "/")
	if !ok || uuid.Validate(publicID) != nil {
		return "", false
	}
	return publicID, true
}

// ReserveTicketAttachmentUpload serializes quota admission per uploader and
// creates the provenance row in the same transaction. Locking the uploader's
// user row gives MySQL and PostgreSQL a stable cross-instance mutex; SQLite
// serializes the subsequent write transaction and fails closed on contention.
// The reservation counts toward quota immediately but cannot be attached to a
// message until MarkTicketAttachmentUploadReady succeeds after the object put.
func ReserveTicketAttachmentUpload(storageKey, originalName string, uploaderUserID int, sizeBytes int64, contentType string, placement TicketAttachmentStoragePlacement) (*TicketAttachmentUpload, error) {
	if sizeBytes <= 0 {
		return nil, errors.New("ticket attachment size must be positive")
	}
	locationJSON, err := common.Marshal(placement.Location)
	if err != nil {
		return nil, fmt.Errorf("marshal ticket attachment storage location: %w", err)
	}
	if placement.SecretCiphertext == "" {
		return nil, errors.New("ticket attachment storage secret snapshot is required")
	}
	publicID := uuid.NewString()
	location := string(locationJSON)
	row := &TicketAttachmentUpload{
		PublicId:                &publicID,
		OriginalName:            path.Base(originalName),
		StorageKey:              storageKey,
		UploaderUserId:          uploaderUserID,
		CreatedAt:               common.GetTimestamp(),
		StorageConfigVersion:    &placement.Version,
		StorageLocationJson:     &location,
		StorageSecretCiphertext: &placement.SecretCiphertext,
		SizeBytes:               &sizeBytes,
		ContentType:             &contentType,
		Pending:                 true,
	}
	err = DB.Transaction(func(tx *gorm.DB) error {
		var user User
		if err := lockForUpdate(tx).Select("id").Where("id = ?", uploaderUserID).Take(&user).Error; err != nil {
			return fmt.Errorf("lock ticket attachment quota subject: %w", err)
		}
		fileCount, knownBytes, err := getUserTicketAttachmentUsage(tx, uploaderUserID)
		if err != nil {
			return err
		}
		if fileCount+1 > MaxUserStorageFiles || knownBytes+sizeBytes > MaxUserStorageBytes {
			return ErrStorageQuotaExceeded
		}
		return tx.Create(row).Error
	})
	if err != nil {
		return nil, err
	}
	return row, nil
}

// MarkTicketAttachmentUploadReady makes a completed object put bindable to a
// ticket. The pending predicate prevents a duplicate finalization from
// silently succeeding.
func MarkTicketAttachmentUploadReady(storageKey string, uploaderUserID int) error {
	result := DB.Model(&TicketAttachmentUpload{}).
		Where("storage_key = ? AND uploader_user_id = ? AND pending = ? AND claimed_at = 0", storageKey, uploaderUserID, true).
		Update("pending", false)
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected != 1 {
		return errors.New("ticket attachment reservation is not pending")
	}
	return nil
}

// ReleaseTicketAttachmentUploadReservation removes a failed pre-upload
// reservation. Ready or cleanup-claimed rows are never removed through this
// path.
func ReleaseTicketAttachmentUploadReservation(storageKey string, uploaderUserID int) error {
	result := DB.Where("storage_key = ? AND uploader_user_id = ? AND pending = ? AND claimed_at = 0", storageKey, uploaderUserID, true).
		Delete(&TicketAttachmentUpload{})
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected != 1 {
		return errors.New("ticket attachment reservation was not found")
	}
	return nil
}

// TicketAttachmentUsage is one uploader's aggregate storage footprint. Rows
// written before the SizeBytes column existed have NULL size and are counted
// in UnknownCount rather than KnownBytes, so a large historical backlog reads
// as "unknown", not as zero bytes.
type TicketAttachmentUsage struct {
	UploaderUserId int    `json:"uploader_user_id"`
	FileCount      int64  `json:"file_count"`
	KnownBytes     int64  `json:"known_bytes"`
	UnknownCount   int64  `json:"unknown_count"`
	Username       string `json:"username" gorm:"-"`
}

// GetTicketAttachmentUsageByUser returns per-uploader storage usage ordered by
// known bytes descending. limit <= 0 returns all uploaders. Claimed
// (mid-deletion) rows are excluded so usage reflects live objects only.
func GetTicketAttachmentUsageByUser(limit int) ([]TicketAttachmentUsage, error) {
	q := DB.Model(&TicketAttachmentUpload{}).
		Select("uploader_user_id, COUNT(*) AS file_count, COALESCE(SUM(size_bytes), 0) AS known_bytes, SUM(CASE WHEN size_bytes IS NULL THEN 1 ELSE 0 END) AS unknown_count").
		Where("claimed_at = 0").
		Group("uploader_user_id").
		Order("known_bytes DESC")
	if limit > 0 {
		q = q.Limit(limit)
	}
	// Non-nil so an empty result serializes as [] rather than null -- the
	// frontend consumes users.length directly.
	usage := make([]TicketAttachmentUsage, 0)
	if err := q.Scan(&usage).Error; err != nil {
		return nil, err
	}
	return usage, nil
}

const (
	// MaxUserStorageBytes / MaxUserStorageFiles are hard per-user ceilings on
	// ticket attachment storage. ReserveTicketAttachmentUpload checks and
	// consumes capacity under the uploader's database row lock.
	MaxUserStorageBytes = 500 * 1024 * 1024 // 500 MiB
	MaxUserStorageFiles = 1000
)

// GetUserTicketAttachmentUsage returns one user's reserved or live file count
// and known byte total (NULL-size rows contribute to the count but not bytes).
func GetUserTicketAttachmentUsage(uploaderUserID int) (fileCount int64, knownBytes int64, err error) {
	return getUserTicketAttachmentUsage(DB, uploaderUserID)
}

func getUserTicketAttachmentUsage(tx *gorm.DB, uploaderUserID int) (fileCount int64, knownBytes int64, err error) {
	var row struct {
		FileCount  int64
		KnownBytes int64
	}
	if err = tx.Model(&TicketAttachmentUpload{}).
		Select("COUNT(*) AS file_count, COALESCE(SUM(size_bytes), 0) AS known_bytes").
		Where("uploader_user_id = ?", uploaderUserID).
		Scan(&row).Error; err != nil {
		return 0, 0, err
	}
	return row.FileCount, row.KnownBytes, nil
}

// TicketAttachmentKeysBelongToUploader reports whether every key in keys was
// actually uploaded by uploaderUserID. A key with no upload record at all
// (never uploaded, or uploaded by someone else) fails this check. Any key
// with a claim (see ClaimTicketAttachmentUploadForCleanup) also fails, no
// matter how stale the claim is: a claim proves the cleanup worker reached
// the point of deleting the object, and a stale one means the worker may
// have crashed after the storage delete but before removing this row -- so
// the object's continued existence can no longer be assumed. Binding must
// therefore only accept claimed_at = 0; stale claims are exclusively for the
// cleanup worker to re-take and drive to row deletion.
func TicketAttachmentKeysBelongToUploader(keys []string, uploaderUserID int) (bool, error) {
	if len(keys) == 0 {
		return true, nil
	}
	var owned []string
	if err := DB.Model(&TicketAttachmentUpload{}).
		Where("storage_key IN ? AND uploader_user_id = ? AND pending = ? AND claimed_at = 0", keys, uploaderUserID, false).
		Pluck("storage_key", &owned).Error; err != nil {
		return false, err
	}
	ownedSet := make(map[string]struct{}, len(owned))
	for _, k := range owned {
		ownedSet[k] = struct{}{}
	}
	for _, k := range keys {
		if _, ok := ownedSet[k]; !ok {
			return false, nil
		}
	}
	return true, nil
}

func TicketAttachmentReferencesBelongToUploader(references []string, uploaderUserID int) (bool, error) {
	keys, err := ticketAttachmentStorageKeys(DB, references)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return false, nil
		}
		return false, err
	}
	return TicketAttachmentKeysBelongToUploader(keys, uploaderUserID)
}

// ticketAttachmentStorageKeys resolves opaque attachment references through
// their provenance rows. Legacy public URLs are accepted only when they
// exactly match the immutable public-base snapshot stored on that row.
func ticketAttachmentStorageKeys(tx *gorm.DB, urls []string) ([]string, error) {
	if len(urls) == 0 {
		return nil, nil
	}
	keys := make([]string, 0, len(urls))
	for _, reference := range urls {
		upload, err := findTicketAttachmentUploadByReference(tx, reference)
		if err != nil {
			return nil, fmt.Errorf("resolve attachment reference %q: %w", reference, err)
		}
		keys = append(keys, upload.StorageKey)
	}
	return keys, nil
}

func FindTicketAttachmentUploadByReference(reference string) (*TicketAttachmentUpload, error) {
	return findTicketAttachmentUploadByReference(DB, reference)
}

func FindTicketAttachmentUploadByPublicID(publicID string) (*TicketAttachmentUpload, error) {
	if uuid.Validate(publicID) != nil {
		return nil, gorm.ErrRecordNotFound
	}
	var upload TicketAttachmentUpload
	if err := DB.Where("public_id = ? AND pending = ? AND claimed_at = 0", publicID, false).First(&upload).Error; err != nil {
		return nil, err
	}
	return &upload, nil
}

func findTicketAttachmentUploadByReference(tx *gorm.DB, reference string) (*TicketAttachmentUpload, error) {
	if publicID, ok := ticketAttachmentReferencePublicID(reference); ok {
		var upload TicketAttachmentUpload
		if err := tx.Where("public_id = ?", publicID).First(&upload).Error; err != nil {
			return nil, err
		}
		if upload.Reference() != reference {
			return nil, gorm.ErrRecordNotFound
		}
		return &upload, nil
	}

	parsed, err := url.Parse(reference)
	if err != nil || parsed.Scheme != "https" || parsed.Host == "" || parsed.RawQuery != "" || parsed.Fragment != "" {
		return nil, gorm.ErrRecordNotFound
	}
	escapedPath := strings.TrimPrefix(parsed.EscapedPath(), "/")
	decodedPath, err := url.PathUnescape(escapedPath)
	if err != nil {
		return nil, gorm.ErrRecordNotFound
	}
	pathVariants := []string{escapedPath}
	if decodedPath != escapedPath {
		pathVariants = append(pathVariants, decodedPath)
	}
	candidateSet := make(map[string]struct{})
	candidates := make([]string, 0)
	for _, pathVariant := range pathVariants {
		parts := strings.Split(pathVariant, "/")
		for i := range parts {
			candidate := strings.Join(parts[i:], "/")
			if candidate == "" {
				continue
			}
			if _, exists := candidateSet[candidate]; exists {
				continue
			}
			candidateSet[candidate] = struct{}{}
			candidates = append(candidates, candidate)
		}
	}
	if len(candidates) == 0 {
		return nil, gorm.ErrRecordNotFound
	}
	var uploads []TicketAttachmentUpload
	if err := tx.Where("storage_key IN ?", candidates).Find(&uploads).Error; err != nil {
		return nil, err
	}
	for i := range uploads {
		base := ""
		if uploads[i].StorageLocationJson != nil {
			var location storage_setting.StorageLocation
			if common.Unmarshal([]byte(*uploads[i].StorageLocationJson), &location) == nil {
				base = location.PublicBaseURL
			}
		}
		if base == "" {
			base = storage_setting.GetStorageSettings().Location.PublicBaseURL
		}
		if base != "" && strings.TrimRight(base, "/")+"/"+uploads[i].StorageKey == reference {
			return &uploads[i], nil
		}
	}
	return nil, gorm.ErrRecordNotFound
}

func (upload *TicketAttachmentUpload) Reference() string {
	if upload.PublicId == nil || *upload.PublicId == "" {
		return ""
	}
	name := upload.OriginalName
	if name == "" {
		name = path.Base(upload.StorageKey)
	}
	return TicketAttachmentReference(*upload.PublicId, name)
}

func (upload *TicketAttachmentUpload) StoragePlacement() (TicketAttachmentStoragePlacement, error) {
	if upload.StorageConfigVersion == nil || upload.StorageLocationJson == nil || upload.StorageSecretCiphertext == nil {
		return TicketAttachmentStoragePlacement{}, errors.New("attachment storage placement is unavailable")
	}
	var location storage_setting.StorageLocation
	if err := common.Unmarshal([]byte(*upload.StorageLocationJson), &location); err != nil {
		return TicketAttachmentStoragePlacement{}, fmt.Errorf("decode attachment storage location: %w", err)
	}
	return TicketAttachmentStoragePlacement{
		Version:          *upload.StorageConfigVersion,
		Location:         location,
		SecretCiphertext: *upload.StorageSecretCiphertext,
	}, nil
}

// BackfillTicketAttachmentPublicIDs completes the additive public-id expand
// migration. The column remains nullable for rolling-version compatibility;
// every row visible to the new binary is assigned a stable UUID before the
// server begins accepting requests.
func BackfillTicketAttachmentPublicIDs() error {
	for {
		var rows []TicketAttachmentUpload
		if err := DB.Where("public_id IS NULL OR public_id = ''").Order("id").Limit(200).Find(&rows).Error; err != nil {
			return err
		}
		if len(rows) == 0 {
			return nil
		}
		for i := range rows {
			publicID := uuid.NewString()
			updates := map[string]interface{}{"public_id": publicID}
			if rows[i].OriginalName == "" {
				updates["original_name"] = path.Base(rows[i].StorageKey)
			}
			result := DB.Model(&TicketAttachmentUpload{}).
				Where("id = ? AND (public_id IS NULL OR public_id = '')", rows[i].Id).
				Updates(updates)
			if result.Error != nil {
				return result.Error
			}
		}
	}
}

// BackfillLegacyTicketAttachmentStorageSnapshots freezes the active location
// and encrypted credential onto rows created before placement provenance was
// introduced. It runs only after options are loaded; when storage has never
// been configured there is no truthful placement to infer, so rows remain
// explicitly unresolved rather than receiving fabricated defaults.
func BackfillLegacyTicketAttachmentStorageSnapshots() error {
	settings := storage_setting.GetStorageSettings()
	if strings.TrimSpace(settings.Location.Endpoint) == "" || strings.TrimSpace(settings.Location.Bucket) == "" {
		return nil
	}
	var secretOption Option
	if err := DB.Where(clause.Eq{Column: clause.Column{Name: "key"}, Value: OptionStorageSecretAccessKey}).First(&secretOption).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil
		}
		return err
	}
	if strings.TrimSpace(secretOption.Value) == "" {
		return nil
	}
	locationJSON, err := common.Marshal(settings.Location)
	if err != nil {
		return err
	}
	return DB.Model(&TicketAttachmentUpload{}).
		Where("storage_location_json IS NULL OR storage_location_json = ''").
		Updates(map[string]interface{}{
			"storage_config_version":    settings.Version,
			"storage_location_json":     string(locationJSON),
			"storage_secret_ciphertext": secretOption.Value,
		}).Error
}

// claimTicketAttachmentUploadsForMessage re-verifies, inside the caller's own
// transaction, that every key in keys is ready, still belongs to
// uploaderUserID, and is not claimed by the cleanup worker. This closes the
// TOCTOU window that
// controller.validateTicketAttachmentUrlsBelongToCaller's pre-check cannot:
// that check runs before CreateTicket/ReplyToTicket even starts a
// transaction, so a key that passed the pre-check could still be claimed and
// deleted by the cleanup worker in the gap before this transaction's
// tx.Create(&message) actually runs.
//
// lockForUpdate holds a row lock on the matched upload rows for the rest of
// this transaction: ClaimTicketAttachmentUploadForCleanup's UPDATE on the
// same row blocks until this transaction commits or rolls back. So by the
// time the cleanup worker's claim actually proceeds, either the message
// referencing the key is already committed (the claim's own NOT EXISTS check
// then correctly refuses it) or this transaction rolled back (nothing to
// protect). A plain SELECT beforehand, without the lock, would leave the
// exact same gap this function exists to close.
func claimTicketAttachmentUploadsForMessage(tx *gorm.DB, keys []string, uploaderUserID int) (bool, error) {
	if len(keys) == 0 {
		return true, nil
	}
	var owned []string
	if err := lockForUpdate(tx).Model(&TicketAttachmentUpload{}).
		Where("storage_key IN ? AND uploader_user_id = ? AND pending = ? AND claimed_at = 0", keys, uploaderUserID, false).
		Pluck("storage_key", &owned).Error; err != nil {
		return false, err
	}
	ownedSet := make(map[string]struct{}, len(owned))
	for _, k := range owned {
		ownedSet[k] = struct{}{}
	}
	for _, k := range keys {
		if _, ok := ownedSet[k]; !ok {
			return false, nil
		}
	}
	return true, nil
}

// FindTicketAttachmentUploadsOlderThan returns up to limit upload provenance
// rows created before olderThan, ordered by id so a caller can page a full
// scan with an id cursor. It does not filter by whether the upload is still referenced by
// any ticket message -- that check is not expressible as a portable indexed
// predicate against TicketMessage's JSON-encoded attachment_urls column, so
// the cleanup worker folds it into ClaimTicketAttachmentUploadForCleanup's
// atomic claim instead of checking each candidate separately beforehand.
func FindTicketAttachmentUploadsOlderThan(olderThan int64, cursorID int64, limit int) ([]TicketAttachmentUpload, error) {
	var rows []TicketAttachmentUpload
	err := DB.Where("created_at < ? AND id > ?", olderThan, cursorID).
		Order("id ASC").
		Limit(limit).
		Find(&rows).Error
	return rows, err
}

// ClaimTicketAttachmentUploadForCleanup atomically claims one provenance row
// for deletion: the update only matches a row that is not already claimed
// and, in the same statement, still has no ticket message referencing its
// storage key. Folding the reference check into the claim's WHERE clause
// (rather than checking first and claiming second) closes the gap a
// check-then-act sequence would leave open between the check and the claim
// itself.
//
// Winning the claim does not by itself make the object safe to delete: a
// message could still be created for this key after the claim is taken. That
// remaining window is closed on the write side instead --
// TicketAttachmentKeysBelongToUploader excludes claimed keys, so any attach
// attempt made while the claim is held is rejected rather than racing the
// delete. Callers that fail to actually delete the storage object after
// winning the claim must call ReleaseTicketAttachmentUploadClaim so the row
// can be retried on a later sweep instead of being claimed forever.
func ClaimTicketAttachmentUploadForCleanup(id int64, storageKey string, now int64) (bool, error) {
	var upload TicketAttachmentUpload
	if err := DB.Where("id = ? AND storage_key = ?", id, storageKey).First(&upload).Error; err != nil {
		return false, err
	}
	referencePredicate, referenceArgs := ticketAttachmentReferencePredicate(upload)
	staleBefore := now - ticketAttachmentCleanupClaimStale
	result := DB.Model(&TicketAttachmentUpload{}).
		Where("id = ? AND (claimed_at = 0 OR claimed_at < ?)", id, staleBefore).
		Where("NOT EXISTS (SELECT 1 FROM ticket_messages WHERE "+referencePredicate+")", referenceArgs...).
		Update("claimed_at", now)
	if result.Error != nil {
		return false, result.Error
	}
	return result.RowsAffected == 1, nil
}

// ReleaseTicketAttachmentUploadClaim clears a claim taken by
// ClaimTicketAttachmentUploadForCleanup without deleting the row, so a
// candidate whose storage delete call failed (e.g. a transient S3 error) is
// reconsidered on a later sweep instead of being claimed forever. claimToken
// fences a stale worker from releasing a newer worker's replacement claim.
func ReleaseTicketAttachmentUploadClaim(id int64, claimToken int64) error {
	result := DB.Model(&TicketAttachmentUpload{}).
		Where("id = ? AND claimed_at = ?", id, claimToken).
		Update("claimed_at", 0)
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected != 1 {
		return errTicketAttachmentCleanupClaimLost
	}
	return nil
}

// DeleteTicketAttachmentUpload removes one provenance row after the cleanup
// worker has claimed it via ClaimTicketAttachmentUploadForCleanup and
// successfully deleted the underlying storage object. The storage key and
// claim token must still match the worker that performed the delete.
func DeleteTicketAttachmentUpload(id int64, storageKey string, claimToken int64) error {
	result := DB.Where("id = ? AND storage_key = ? AND claimed_at = ?", id, storageKey, claimToken).
		Delete(&TicketAttachmentUpload{})
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected != 1 {
		return errTicketAttachmentCleanupClaimLost
	}
	return nil
}

// FindPurgeableResolvedTicketAttachmentUploads returns provenance rows for
// storage keys referenced by messages of tickets resolved at or before
// resolvedBefore, scanning ticket ids after cursorTicketID up to limit
// tickets. It deliberately does NOT filter out already-claimed rows: if the
// worker deleted the storage object but crashed before
// FinalizeTicketAttachmentRetention completed, the claimed row must resurface
// here so the stale-claim retake inside ClaimTicketAttachmentUploadForRetention
// can finish the idempotent finalization. Adding a claimed_at filter would
// leave such tickets claimed forever, permanently blocking their replies and
// reopens.
//
// This scan is candidate discovery only: a key surfacing here does NOT prove
// it is safe to delete, because the same key can be bound to several tickets
// by its uploader and only one of them has to qualify to appear in this scan.
// The actual all-referencing-tickets-eligible check happens atomically inside
// ClaimTicketAttachmentUploadForRetention at delete time.
func FindPurgeableResolvedTicketAttachmentUploads(resolvedBefore int64, cursorTicketID int64, limit int) (uploads []TicketAttachmentUpload, lastTicketID int64, err error) {
	var tids []int64
	if err = DB.Model(&Ticket{}).
		Where("status = ? AND deleted_at IS NULL AND resolved_at IS NOT NULL AND resolved_at <= ? AND id > ?", TicketStatusResolved, resolvedBefore, cursorTicketID).
		Order("id").Limit(limit).Pluck("id", &tids).Error; err != nil {
		return nil, cursorTicketID, err
	}
	if len(tids) == 0 {
		return nil, cursorTicketID, nil
	}
	lastTicketID = tids[len(tids)-1]

	var rawUrls []string
	if err = DB.Model(&TicketMessage{}).
		Where("ticket_id IN ? AND attachment_urls IS NOT NULL AND attachment_urls <> '' AND attachment_urls <> '[]'", tids).
		Pluck("attachment_urls", &rawUrls).Error; err != nil {
		return nil, lastTicketID, err
	}

	seen := make(map[string]struct{})
	candidates := make([]string, 0)
	for _, raw := range rawUrls {
		var urls []string
		if common.UnmarshalJsonStr(raw, &urls) != nil {
			continue
		}
		ks, kerr := ticketAttachmentStorageKeys(DB, urls)
		if kerr != nil {
			continue
		}
		for _, k := range ks {
			if _, ok := seen[k]; ok {
				continue
			}
			seen[k] = struct{}{}
			candidates = append(candidates, k)
		}
	}
	if len(candidates) == 0 {
		return nil, lastTicketID, nil
	}

	if err = DB.
		Where("storage_key IN ?", candidates).
		Find(&uploads).Error; err != nil {
		return nil, lastTicketID, err
	}
	return uploads, lastTicketID, nil
}

// ClaimTicketAttachmentUploadForRetention takes the exclusive deletion claim
// on one provenance row for the resolved-ticket retention sweep. The claim
// succeeds only if EVERY ticket whose messages reference this key is resolved
// at or before resolvedBefore. It claims those ticket rows in the same
// transaction as the upload row. Ticket mutations require claim_id = 0, so
// either a reopen/reply wins first and defeats this claim, or this claim wins
// and blocks the mutation until finalization removes the deleted URLs.
func ClaimTicketAttachmentUploadForRetention(id int64, storageKey string, now int64, resolvedBefore int64) (bool, error) {
	staleBefore := now - ticketAttachmentCleanupClaimStale
	claimed := false
	err := DB.Transaction(func(tx *gorm.DB) error {
		var upload TicketAttachmentUpload
		if err := tx.Where("id = ? AND storage_key = ?", id, storageKey).First(&upload).Error; err != nil {
			return err
		}
		referencePredicate, referenceArgs := ticketAttachmentReferencePredicate(upload)
		var ticketIDs []int64
		if err := tx.Model(&TicketMessage{}).
			Distinct("ticket_id").
			Where(referencePredicate, referenceArgs...).
			Pluck("ticket_id", &ticketIDs).Error; err != nil {
			return err
		}
		if len(ticketIDs) == 0 {
			return nil
		}
		if ticketAttachmentRetentionClaimBarrier != nil {
			if err := ticketAttachmentRetentionClaimBarrier(tx); err != nil {
				return err
			}
		}

		ticketResult := tx.Model(&Ticket{}).
			Where("id IN ?", ticketIDs).
			Where("status = ? AND deleted_at IS NULL AND resolved_at IS NOT NULL AND resolved_at <= ?", TicketStatusResolved, resolvedBefore).
			Where(ticketAttachmentRetentionUnclaimedSQL+" OR attachment_retention_claimed_at < ?", staleBefore).
			Updates(map[string]interface{}{
				"attachment_retention_claim_id":   id,
				"attachment_retention_claimed_at": now,
			})
		if ticketResult.Error != nil {
			return ticketResult.Error
		}
		if ticketResult.RowsAffected != int64(len(ticketIDs)) {
			return errTicketAttachmentRetentionClaimLost
		}

		uploadResult := tx.Model(&TicketAttachmentUpload{}).
			Where("id = ? AND storage_key = ? AND (claimed_at = 0 OR claimed_at < ?)", id, storageKey, staleBefore).
			Update("claimed_at", now)
		if uploadResult.Error != nil {
			return uploadResult.Error
		}
		if uploadResult.RowsAffected != 1 {
			return errTicketAttachmentRetentionClaimLost
		}

		// Re-enumerate references now that the upload row lock is held. The
		// enumeration above ran before any write: a binder that committed a
		// new message between that read and the upload claim is invisible to
		// it, yet the claim's claimed_at = 0 predicate still succeeds (the
		// binder never touches claimed_at). Binding always locks the upload
		// row first, so from this point on either a binder already committed
		// (this read must see it and abort) or it is blocked on our lock and
		// will find claimed_at set. The read MUST go through lockForUpdate:
		// under MySQL REPEATABLE READ a plain SELECT reuses this
		// transaction's earlier snapshot and would miss the binder's commit;
		// a locking read is a current read. No DISTINCT here — PostgreSQL
		// rejects FOR UPDATE combined with DISTINCT — so deduplicate in Go.
		var verifiedRaw []int64
		if err := lockForUpdate(tx).Model(&TicketMessage{}).
			Where(referencePredicate, referenceArgs...).
			Pluck("ticket_id", &verifiedRaw).Error; err != nil {
			return err
		}
		claimedSet := make(map[int64]struct{}, len(ticketIDs))
		for _, tid := range ticketIDs {
			claimedSet[tid] = struct{}{}
		}
		verifiedSet := make(map[int64]struct{}, len(verifiedRaw))
		for _, tid := range verifiedRaw {
			verifiedSet[tid] = struct{}{}
		}
		if len(verifiedSet) != len(claimedSet) {
			return errTicketAttachmentRetentionClaimLost
		}
		for tid := range verifiedSet {
			if _, ok := claimedSet[tid]; !ok {
				return errTicketAttachmentRetentionClaimLost
			}
		}

		claimed = true
		return nil
	})
	if errors.Is(err, errTicketAttachmentRetentionClaimLost) {
		return false, nil
	}
	return claimed, err
}

func ReleaseTicketAttachmentRetentionClaim(id int64, claimToken int64) error {
	return DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Model(&TicketAttachmentUpload{}).
			Where("id = ? AND claimed_at = ?", id, claimToken).
			Update("claimed_at", 0).Error; err != nil {
			return err
		}
		return tx.Model(&Ticket{}).
			Where("attachment_retention_claim_id = ? AND attachment_retention_claimed_at = ?", id, claimToken).
			Updates(map[string]interface{}{
				"attachment_retention_claim_id":   0,
				"attachment_retention_claimed_at": 0,
			}).Error
	})
}

// FinalizeTicketAttachmentRetention removes the deleted object's URL from
// every referencing message before releasing the ticket claims. If this
// transaction fails after the object was deleted, the claims remain and a
// later stale-claim retry completes the same idempotent finalization.
func FinalizeTicketAttachmentRetention(id int64, storageKey string, claimToken int64) error {
	return DB.Transaction(func(tx *gorm.DB) error {
		var upload TicketAttachmentUpload
		if err := tx.Where("id = ? AND storage_key = ?", id, storageKey).First(&upload).Error; err != nil {
			return err
		}
		referencePredicate, referenceArgs := ticketAttachmentReferencePredicate(upload)
		var messages []TicketMessage
		if err := tx.Where(referencePredicate, referenceArgs...).Find(&messages).Error; err != nil {
			return err
		}
		var claimedTicketIDs []int64
		if err := tx.Model(&Ticket{}).
			Where("attachment_retention_claim_id = ? AND attachment_retention_claimed_at = ?", id, claimToken).
			Pluck("id", &claimedTicketIDs).Error; err != nil {
			return err
		}
		claimedSet := make(map[int64]struct{}, len(claimedTicketIDs))
		for _, tid := range claimedTicketIDs {
			claimedSet[tid] = struct{}{}
		}
		for i := range messages {
			urls := messages[i].DecodedAttachmentUrls()
			kept := make([]string, 0, len(urls))
			for _, rawURL := range urls {
				keys, err := ticketAttachmentStorageKeys(tx, []string{rawURL})
				if err != nil || len(keys) != 1 || keys[0] != storageKey {
					kept = append(kept, rawURL)
				}
			}
			if len(kept) == len(urls) {
				continue
			}
			// A real reference on a ticket this claim never covered means the
			// claim-time verification was defeated; deleting the reference
			// would silently destroy a live ticket's attachment link. Fail
			// loudly and leave the claim in place for operator inspection.
			if _, ok := claimedSet[messages[i].TicketId]; !ok {
				return fmt.Errorf("attachment retention finalize: message %d on ticket %d references %s outside claim %d", messages[i].Id, messages[i].TicketId, storageKey, id)
			}
			encoded, err := encodeTicketAttachmentUrls(kept)
			if err != nil {
				return err
			}
			if err := tx.Model(&TicketMessage{}).Where("id = ?", messages[i].Id).
				Update("attachment_urls", encoded).Error; err != nil {
				return err
			}
		}

		result := tx.Where("id = ? AND storage_key = ? AND claimed_at = ?", id, storageKey, claimToken).
			Delete(&TicketAttachmentUpload{})
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected != 1 {
			return fmt.Errorf("attachment retention claim %d is no longer owned", id)
		}
		return tx.Model(&Ticket{}).
			Where("attachment_retention_claim_id = ? AND attachment_retention_claimed_at = ?", id, claimToken).
			Updates(map[string]interface{}{
				"attachment_retention_claim_id":   0,
				"attachment_retention_claimed_at": 0,
			}).Error
	})
}

func ticketAttachmentReferencePredicate(upload TicketAttachmentUpload) (string, []interface{}) {
	legacyPattern := "%" + ticketAttachmentLikeToken(upload.StorageKey) + "\"%"
	reference := upload.Reference()
	if reference == "" {
		return "attachment_urls LIKE ? ESCAPE '!'", []interface{}{legacyPattern}
	}
	referencePattern := "%" + ticketAttachmentLikeToken(reference) + "\"%"
	return "attachment_urls LIKE ? ESCAPE '!' OR attachment_urls LIKE ? ESCAPE '!'", []interface{}{legacyPattern, referencePattern}
}

// ticketAttachmentLikeToken returns the byte form in which value appears
// inside the stored attachment_urls JSON. common.Marshal HTML-escapes
// characters such as '&' into unicode escape sequences, so a LIKE pattern
// built from the raw value would silently miss stored references
// containing them.
func ticketAttachmentLikeToken(value string) string {
	encoded, err := common.Marshal(value)
	if err != nil || len(encoded) < 2 {
		return ticketLikeEscaper.Replace(value)
	}
	return ticketLikeEscaper.Replace(string(encoded[1 : len(encoded)-1]))
}
