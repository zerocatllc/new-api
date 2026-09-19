package controller

import (
	"crypto/hmac"
	"errors"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"path"
	"strconv"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/dto"
	"github.com/QuantumNous/new-api/logger"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/setting/storage_setting"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

const (
	// MaxTicketAttachmentSize bounds a single ticket attachment upload.
	MaxTicketAttachmentSize = 10 << 20 // 10 MiB

	ticketAttachmentDownloadTTL = 5 * time.Minute

	// ticketAttachmentSniffSize is how many bytes of the upload are read for
	// content sniffing -- http.DetectContentType never looks past this many.
	ticketAttachmentSniffSize = 512
)

// ticketAttachmentAllowedTypes whitelists ticket attachment extensions and
// the sniffed content-type prefixes each one may actually contain. The
// client-submitted multipart Content-Type header is never trusted: an
// uploader can set it to anything, so accepting it as-is would let an HTML
// or SVG file (which can execute script if a public storage domain ever
// serves it inline) be uploaded and stored under any extension. docx/xlsx/
// pptx are OOXML, i.e. zip archives, so they sniff the same as a plain
// .zip -- there is no cheap way to tell them apart from the first 512
// bytes, so both are allowed for that whole extension group.
var ticketAttachmentAllowedTypes = map[string][]string{
	".jpg":  {"image/jpeg"},
	".jpeg": {"image/jpeg"},
	".png":  {"image/png"},
	".gif":  {"image/gif"},
	".webp": {"image/webp"},
	".pdf":  {"application/pdf"},
	".docx": {"application/zip", "application/octet-stream"},
	".xlsx": {"application/zip", "application/octet-stream"},
	".pptx": {"application/zip", "application/octet-stream"},
	".zip":  {"application/zip", "application/octet-stream", "application/x-zip-compressed"},
	".txt":  {"text/plain"},
	".csv":  {"text/plain"},
	".json": {"text/plain", "application/json"},
	".log":  {"text/plain"},
	".md":   {"text/plain"},
}

// storagePutTicketAttachmentFunc / storageDeleteTicketAttachmentFunc indirect
// the storage calls so tests can exercise the upload failure paths without a
// real S3-compatible backend (mirrors ticketAttachmentCleanupDeleteFunc in
// service/ticket_attachment_cleanup_worker.go).
var (
	storagePutTicketAttachmentFunc    = service.StoragePutTicketAttachment
	storageDeleteTicketAttachmentFunc = service.StorageDeleteTicketAttachment
)

// validateTicketAttachmentContent rejects an extension outside
// ticketAttachmentAllowedTypes, then sniffs the file's actual bytes (never
// the client-declared multipart Content-Type) and rejects a mismatch against
// that extension's allowed content types. Returns the sniffed content type,
// which is what gets stored on the object -- not whatever the client sent.
// file must be an io.Seeker positioned at 0 on entry; it is reset to 0
// before returning so the full content is still available for the caller's
// subsequent upload.
func validateTicketAttachmentContent(filename string, file multipart.File) (string, error) {
	ext := strings.ToLower(path.Ext(filename))
	allowed, ok := ticketAttachmentAllowedTypes[ext]
	if !ok {
		return "", fmt.Errorf("file type %q is not allowed", ext)
	}
	buf := make([]byte, ticketAttachmentSniffSize)
	n, err := io.ReadFull(io.LimitReader(file, ticketAttachmentSniffSize), buf)
	if err != nil && !errors.Is(err, io.ErrUnexpectedEOF) && !errors.Is(err, io.EOF) {
		return "", err
	}
	if _, err := file.Seek(0, io.SeekStart); err != nil {
		return "", err
	}
	sniffed := http.DetectContentType(buf[:n])
	for _, prefix := range allowed {
		if strings.HasPrefix(sniffed, prefix) {
			return sniffed, nil
		}
	}
	return "", fmt.Errorf("file content (detected as %q) does not match its %q extension", sniffed, ext)
}

// UploadTicketAttachment stores a file the caller will reference by URL when
// creating or replying to a ticket. Uploads are independent of any specific
// ticket — the create/reply forms collect each upload's returned URL
// client-side and submit the whole list together with the ticket message —
// so this single handler serves both the user and admin upload routes; only
// the uploading caller's own id scopes the storage key.
func UploadTicketAttachment(c *gin.Context) {
	if available, reason := storage_setting.Availability(); !available {
		// The reason names internal operational state (encryption key
		// presence, secret decryptability) and is for operators, not for
		// arbitrary authenticated users probing this endpoint.
		logger.LogWarn(c, "ticket attachment upload rejected, storage unavailable: "+reason)
		common.ApiErrorMsg(c, "attachments are currently unavailable, please contact the administrator")
		return
	}
	snapshot, plaintextSecret, err := storage_setting.SnapshotForUse()
	if err != nil {
		common.ApiErrorMsg(c, "attachments are currently unavailable, please contact the administrator")
		return
	}
	secretCiphertext, err := storage_setting.EncryptSecret(plaintextSecret)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	fileHeader, err := c.FormFile("file")
	if err != nil {
		common.ApiErrorMsg(c, "invalid request: missing file")
		return
	}
	if fileHeader.Size <= 0 || fileHeader.Size > MaxTicketAttachmentSize {
		common.ApiErrorMsg(c, fmt.Sprintf("file size must be between 1 byte and %d bytes", MaxTicketAttachmentSize))
		return
	}
	file, err := fileHeader.Open()
	if err != nil {
		common.ApiError(c, err)
		return
	}
	defer file.Close()

	sniffedContentType, err := validateTicketAttachmentContent(fileHeader.Filename, file)
	if err != nil {
		common.ApiErrorMsg(c, err.Error())
		return
	}

	uploaderUserID := c.GetInt("id")
	key := service.BuildTicketAttachmentKey(uploaderUserID, fileHeader.Filename)
	upload, err := model.ReserveTicketAttachmentUpload(key, fileHeader.Filename, uploaderUserID, fileHeader.Size, sniffedContentType, model.TicketAttachmentStoragePlacement{
		Version:          snapshot.Version,
		Location:         snapshot.Location,
		SecretCiphertext: secretCiphertext,
	})
	if err != nil {
		if !errors.Is(err, model.ErrStorageQuotaExceeded) {
			common.ApiError(c, err)
			return
		}
		common.ApiErrorMsg(c, fmt.Sprintf("storage quota exceeded: each account may store up to %d files totaling %d bytes", model.MaxUserStorageFiles, model.MaxUserStorageBytes))
		return
	}
	if err := storagePutTicketAttachmentFunc(c.Request.Context(), upload, plaintextSecret, sniffedContentType, file, fileHeader.Size); err != nil {
		// A put failure does not prove the object is absent: a client-side
		// timeout can race a put that already landed server-side. Releasing
		// the reservation outright would erase the only record the orphan
		// cleanup worker scans, turning such an object into a permanently
		// unbilled orphan. So compensate with an idempotent delete first, and
		// only a confirmed delete may release the reservation; otherwise the
		// pending row stays for the worker to claim and retry.
		common.SysError("ticket attachment object put failed for " + key + ": " + err.Error())
		if delErr := storageDeleteTicketAttachmentFunc(c.Request.Context(), upload); delErr != nil {
			common.SysError("failed to delete ticket attachment " + key + " after object put failure: " + delErr.Error())
		} else if releaseErr := model.ReleaseTicketAttachmentUploadReservation(key, uploaderUserID); releaseErr != nil {
			common.SysError("failed to release ticket attachment reservation " + key + " after compensating object delete: " + releaseErr.Error())
		}
		// The raw storage error can embed the endpoint URL, bucket, and object
		// key (e.g. a wrapped transport error), so the client only gets a
		// generic message; the full error is in the system log above.
		common.ApiErrorMsg(c, "failed to store the attachment, please try again later")
		return
	}
	if err := model.MarkTicketAttachmentUploadReady(key, uploaderUserID); err != nil {
		// Keep the pending provenance row unless the compensating object delete
		// succeeds. That lets the orphan worker recover the object if either the
		// database finalization or this immediate cleanup fails.
		if delErr := storageDeleteTicketAttachmentFunc(c.Request.Context(), upload); delErr != nil {
			common.SysError("failed to delete pending ticket attachment " + key + " after reservation finalization failure: " + delErr.Error())
		} else if releaseErr := model.ReleaseTicketAttachmentUploadReservation(key, uploaderUserID); releaseErr != nil {
			common.SysError("failed to release ticket attachment reservation " + key + " after compensating object delete: " + releaseErr.Error())
		}
		common.ApiError(c, err)
		return
	}

	common.ApiSuccess(c, dto.TicketAttachmentUploadResponse{Url: upload.Reference()})
}

// DownloadMyTicketAttachment redirects the caller to a short-lived presigned
// URL for one of their own ticket attachments.
func DownloadMyTicketAttachment(c *gin.Context) {
	userID := c.GetInt("id")
	downloadTicketAttachment(c, &userID)
}

// DownloadTicketAttachmentAdmin redirects staff to a short-lived presigned URL
// for any ticket's attachment — staff already has TicketRead visibility into
// every ticket via the route's permission gate, so no extra ownership check
// applies here.
func DownloadTicketAttachmentAdmin(c *gin.Context) {
	downloadTicketAttachment(c, nil)
}

// downloadTicketAttachment validates the opaque upload reference and, when
// ownerUserID is non-nil, that a public message on the user's own ticket
// references it, before issuing a short-lived same-origin capability.
func downloadTicketAttachment(c *gin.Context, ownerUserID *int) {
	reference := c.Query("url")

	// A ticket owner may not be authorized to see every message referencing
	// this URL: staff can attach files to an internal-only note on the
	// customer's own ticket, and those object keys must stay inaccessible to
	// that customer even if the URL ever reaches them through another
	// channel (see TestDownloadMyTicketAttachmentRejectsInternalOnlyMessage).
	// FindPublicTicketMessageByAttachmentURLForOwner folds ownership and
	// visibility into the query itself instead of fetching an arbitrary
	// matching row and checking it after the fact -- necessary because the
	// same storage key can be referenced by more than one message, and an
	// unfiltered lookup could nondeterministically land on the internal-only
	// row even when a public reference also exists (see
	// TestDownloadMyTicketAttachmentAllowsPublicMessageEvenWhenAlsoReferencedInternally).
	var err error
	if ownerUserID != nil {
		_, err = model.FindPublicTicketMessageByAttachmentURLForOwner(reference, *ownerUserID)
	} else {
		_, err = model.FindTicketMessageByAttachmentURL(reference)
	}
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			common.ApiErrorMsg(c, "attachment not found")
			return
		}
		common.ApiError(c, err)
		return
	}

	upload, err := model.FindTicketAttachmentUploadByReference(reference)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			common.ApiErrorMsg(c, "attachment not found")
			return
		}
		common.ApiError(c, err)
		return
	}
	inline := c.Query("inline") == "1" && isTicketImageKey(upload.StorageKey)
	common.ApiSuccess(c, dto.TicketAttachmentDownloadResponse{Url: ticketAttachmentAccessPath(upload, inline, time.Now())})
}

func ticketAttachmentAccessSignature(publicID string, expires int64, inline bool) string {
	purpose := "download"
	if inline {
		purpose = "inline"
	}
	payload := fmt.Sprintf("ticket-attachment-v1\n%s\n%d\n%s", publicID, expires, purpose)
	return common.GenerateHMACWithKey([]byte(common.SessionSecret), payload)
}

func ticketAttachmentAccessPath(upload *model.TicketAttachmentUpload, inline bool, now time.Time) string {
	expires := now.Add(ticketAttachmentDownloadTTL).Unix()
	publicID := ""
	if upload.PublicId != nil {
		publicID = *upload.PublicId
	}
	query := "expires=" + strconv.FormatInt(expires, 10) + "&signature=" + ticketAttachmentAccessSignature(publicID, expires, inline)
	if inline {
		query += "&inline=1"
	}
	return "/api/ticket-attachments/" + publicID + "?" + query
}

// ServeTicketAttachment consumes a short-lived capability issued only after
// the authenticated ticket/message authorization check above. Downloads are
// redirected to a storage presign; image previews are proxied through this
// same-origin endpoint with a hard size bound, so bucket CORS is irrelevant.
func ServeTicketAttachment(c *gin.Context) {
	publicID := c.Param("public_id")
	expires, err := strconv.ParseInt(c.Query("expires"), 10, 64)
	if err != nil || expires < time.Now().Unix() || expires > time.Now().Add(ticketAttachmentDownloadTTL+time.Minute).Unix() {
		c.AbortWithStatus(http.StatusForbidden)
		return
	}
	inline := c.Query("inline") == "1"
	expected := ticketAttachmentAccessSignature(publicID, expires, inline)
	if !hmac.Equal([]byte(expected), []byte(c.Query("signature"))) {
		c.AbortWithStatus(http.StatusForbidden)
		return
	}
	upload, err := model.FindTicketAttachmentUploadByPublicID(publicID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			c.AbortWithStatus(http.StatusNotFound)
			return
		}
		common.ApiError(c, err)
		return
	}
	if !inline {
		presigned, err := service.StoragePresignTicketAttachment(c.Request.Context(), upload, ticketAttachmentDownloadTTL)
		if err != nil {
			common.ApiError(c, err)
			return
		}
		c.Header("Cache-Control", "private, no-store")
		c.Redirect(http.StatusFound, presigned)
		return
	}
	if !isTicketImageKey(upload.StorageKey) {
		c.AbortWithStatus(http.StatusBadRequest)
		return
	}
	body, contentType, err := service.StorageGetTicketAttachment(c.Request.Context(), upload)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	defer body.Close()
	data, err := io.ReadAll(io.LimitReader(body, MaxTicketAttachmentSize+1))
	if err != nil {
		common.ApiError(c, err)
		return
	}
	if len(data) > MaxTicketAttachmentSize {
		common.ApiErrorMsg(c, "attachment exceeds preview size limit")
		return
	}
	if !strings.HasPrefix(contentType, "image/") {
		c.AbortWithStatus(http.StatusUnsupportedMediaType)
		return
	}
	c.Header("Cache-Control", "private, no-store")
	c.Header("Content-Security-Policy", "default-src 'none'; sandbox")
	c.Header("X-Content-Type-Options", "nosniff")
	c.Data(http.StatusOK, contentType, data)
}

func isTicketImageKey(key string) bool {
	switch strings.ToLower(path.Ext(key)) {
	case ".jpg", ".jpeg", ".png", ".gif", ".webp":
		return true
	default:
		return false
	}
}
