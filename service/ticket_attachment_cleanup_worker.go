package service

import (
	"context"
	"fmt"
	"sync"
	"sync/atomic"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/logger"
	"github.com/QuantumNous/new-api/model"

	"github.com/bytedance/gopkg/util/gopool"
)

const (
	ticketAttachmentCleanupTickInterval = 30 * time.Minute
	ticketAttachmentCleanupBatchSize    = 200
	// ticketAttachmentOrphanRetention is how long an uploaded attachment may
	// sit unreferenced by any ticket message before the cleanup worker treats
	// it as abandoned (upload-but-never-attach, or a create/reply request
	// that failed after the upload already succeeded) and deletes both the
	// storage object and its provenance row. It is well past the time any
	// legitimate in-progress compose (upload immediately followed by submit)
	// could take.
	ticketAttachmentOrphanRetention = 24 * time.Hour
	// ticketAttachmentResolvedRetention is how long after a ticket is resolved
	// its (still-referenced) attachments are kept before the retention sweep
	// reclaims them. Unlike orphan cleanup, this deletes attachments that ARE
	// referenced -- the ticket text stays, but its files are purged once the
	// ticket has been resolved this long. A dangling reference degrades to a
	// clean "not found" on download.
	ticketAttachmentResolvedRetention = 90 * 24 * time.Hour
)

var (
	ticketAttachmentCleanupOnce    sync.Once
	ticketAttachmentCleanupRunning atomic.Bool

	// ticketAttachmentCleanupDeleteFunc indirects the storage delete call so
	// tests can stub it out instead of needing a real S3-compatible backend.
	ticketAttachmentCleanupDeleteFunc = func(ctx context.Context, upload model.TicketAttachmentUpload) error {
		return StorageDeleteTicketAttachment(ctx, &upload)
	}
)

// StartTicketAttachmentCleanupWorker starts the background goroutine that
// deletes orphaned ticket attachment uploads: UploadTicketAttachment writes a
// storage object and a TicketAttachmentUpload provenance row independently of
// whether the caller ever actually attaches that key to a ticket message, and
// the upload endpoint's rate limit is per-IP, not a total-storage cap -- so
// without this sweep, uploads that are never referenced accumulate billed
// storage forever. Same ticker+atomic.Bool skeleton as the other ticket
// workers.
func StartTicketAttachmentCleanupWorker() {
	ticketAttachmentCleanupOnce.Do(func() {
		if !common.IsMasterNode {
			return
		}
		gopool.Go(func() {
			logger.LogInfo(context.Background(), fmt.Sprintf("ticket attachment cleanup worker started: tick=%s", ticketAttachmentCleanupTickInterval))
			ticker := time.NewTicker(ticketAttachmentCleanupTickInterval)
			defer ticker.Stop()

			runTicketAttachmentCleanupOnce()
			for range ticker.C {
				runTicketAttachmentCleanupOnce()
			}
		})
	})
}

func runTicketAttachmentCleanupOnce() {
	if !ticketAttachmentCleanupRunning.CompareAndSwap(false, true) {
		return
	}
	defer ticketAttachmentCleanupRunning.Store(false)

	ctx := context.Background()
	olderThan := common.GetTimestamp() - int64(ticketAttachmentOrphanRetention.Seconds())

	var cursorID int64
	for {
		candidates, err := model.FindTicketAttachmentUploadsOlderThan(olderThan, cursorID, ticketAttachmentCleanupBatchSize)
		if err != nil {
			logger.LogWarn(ctx, fmt.Sprintf("ticket attachment cleanup scan query failed: %v", err))
			return
		}
		if len(candidates) == 0 {
			break
		}
		for _, upload := range candidates {
			claimToken := common.GetTimestamp()
			claimed, err := model.ClaimTicketAttachmentUploadForCleanup(upload.Id, upload.StorageKey, claimToken)
			if err != nil {
				logger.LogWarn(ctx, fmt.Sprintf("ticket attachment cleanup claim for %q failed: %v", upload.StorageKey, err))
				continue
			}
			if !claimed {
				// Either already referenced by a message, or already claimed
				// by a previous (still in-flight or crashed) sweep.
				continue
			}
			if err := ticketAttachmentCleanupDeleteFunc(ctx, upload); err != nil {
				logger.LogWarn(ctx, fmt.Sprintf("ticket attachment cleanup failed to delete storage object %q: %v", upload.StorageKey, err))
				if releaseErr := model.ReleaseTicketAttachmentUploadClaim(upload.Id, claimToken); releaseErr != nil {
					logger.LogWarn(ctx, fmt.Sprintf("ticket attachment cleanup failed to release claim on row %d: %v", upload.Id, releaseErr))
				}
				continue
			}
			if err := model.DeleteTicketAttachmentUpload(upload.Id, upload.StorageKey, claimToken); err != nil {
				logger.LogWarn(ctx, fmt.Sprintf("ticket attachment cleanup failed to delete provenance row %d: %v", upload.Id, err))
			}
		}
		cursorID = candidates[len(candidates)-1].Id
		if len(candidates) < ticketAttachmentCleanupBatchSize {
			break
		}
	}

	runResolvedTicketAttachmentRetentionOnce(ctx)
}

// runResolvedTicketAttachmentRetentionOnce reclaims attachments of tickets
// resolved longer ago than ticketAttachmentResolvedRetention. Unlike the
// orphan sweep above it deletes still-referenced objects, so every delete is
// gated by ClaimTicketAttachmentUploadForRetention, whose WHERE atomically
// re-verifies that EVERY ticket referencing the key is resolved past the
// cutoff -- a second still-open ticket bound to the same key, or a concurrent
// reopen, defeats the claim instead of racing the delete. The scan itself is
// candidate discovery only and pages through resolved-old tickets by id.
func runResolvedTicketAttachmentRetentionOnce(ctx context.Context) {
	cutoff := common.GetTimestamp() - int64(ticketAttachmentResolvedRetention.Seconds())
	var cursorTicketID int64
	for {
		uploads, lastTicketID, err := model.FindPurgeableResolvedTicketAttachmentUploads(cutoff, cursorTicketID, ticketAttachmentCleanupBatchSize)
		if err != nil {
			logger.LogWarn(ctx, fmt.Sprintf("resolved ticket attachment retention scan failed: %v", err))
			return
		}
		if lastTicketID == cursorTicketID {
			// No further resolved-old tickets to scan.
			return
		}
		for _, upload := range uploads {
			claimToken := common.GetTimestamp()
			claimed, err := model.ClaimTicketAttachmentUploadForRetention(upload.Id, upload.StorageKey, claimToken, cutoff)
			if err != nil {
				logger.LogWarn(ctx, fmt.Sprintf("resolved ticket attachment retention claim for %q failed: %v", upload.StorageKey, err))
				continue
			}
			if !claimed {
				// Referenced by a not-yet-eligible ticket (open, or resolved
				// too recently), or already claimed by another sweep.
				continue
			}
			if err := ticketAttachmentCleanupDeleteFunc(ctx, upload); err != nil {
				// Release the claim so the next sweep retries the delete
				// rather than orphaning the object with no record of it.
				logger.LogWarn(ctx, fmt.Sprintf("resolved ticket attachment retention failed to delete storage object %q: %v", upload.StorageKey, err))
				if releaseErr := model.ReleaseTicketAttachmentRetentionClaim(upload.Id, claimToken); releaseErr != nil {
					logger.LogWarn(ctx, fmt.Sprintf("resolved ticket attachment retention failed to release claim on row %d: %v", upload.Id, releaseErr))
				}
				continue
			}
			if err := model.FinalizeTicketAttachmentRetention(upload.Id, upload.StorageKey, claimToken); err != nil {
				logger.LogWarn(ctx, fmt.Sprintf("resolved ticket attachment retention failed to finalize provenance row %d: %v", upload.Id, err))
			}
		}
		cursorTicketID = lastTicketID
	}
}
