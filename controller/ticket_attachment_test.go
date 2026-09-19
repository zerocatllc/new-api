package controller

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/base64"
	"errors"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting/storage_setting"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

var ticketAttachmentTestEncryptionKey = func() string {
	key := make([]byte, 32)
	_, _ = io.ReadFull(rand.Reader, key)
	return base64.StdEncoding.EncodeToString(key)
}()

// fakeMultipartFile adapts a bytes.Reader to the multipart.File interface
// (Read/ReadAt/Seek/Close) validateTicketAttachmentContent needs, without
// spinning up a real multipart request.
type fakeMultipartFile struct {
	*bytes.Reader
}

func (fakeMultipartFile) Close() error { return nil }

func newFakeMultipartFile(content []byte) fakeMultipartFile {
	return fakeMultipartFile{Reader: bytes.NewReader(content)}
}

// TestValidateTicketAttachmentContentSniffsRealBytes is the regression test
// for trusting the client-declared multipart Content-Type: every case here
// is judged purely by extension + the actual leading bytes, matching what
// http.DetectContentType reports, never a caller-supplied MIME string.
func TestValidateTicketAttachmentContentSniffsRealBytes(t *testing.T) {
	pngMagic := []byte{0x89, 'P', 'N', 'G', 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0}
	pdfMagic := []byte("%PDF-1.4\n%rest of a pdf")
	zipMagic := []byte{'P', 'K', 0x03, 0x04, 0, 0, 0, 0}
	htmlPayload := []byte("<script>alert(document.domain)</script>")
	plainText := []byte("just a plain text ticket attachment body")

	tests := []struct {
		name        string
		filename    string
		content     []byte
		wantErr     bool
		wantErrLike string
	}{
		{name: "png with matching extension", filename: "screenshot.png", content: pngMagic, wantErr: false},
		{name: "png bytes with mismatched extension", filename: "screenshot.pdf", content: pngMagic, wantErr: true, wantErrLike: "does not match"},
		{name: "pdf with matching extension", filename: "document.pdf", content: pdfMagic, wantErr: false},
		{name: "html payload disguised as png", filename: "avatar.png", content: htmlPayload, wantErr: true, wantErrLike: "does not match"},
		{name: "html payload disguised as unlisted extension", filename: "avatar.svg", content: htmlPayload, wantErr: true, wantErrLike: "not allowed"},
		{name: "zip bytes as docx", filename: "report.docx", content: zipMagic, wantErr: false},
		{name: "zip bytes as zip", filename: "archive.zip", content: zipMagic, wantErr: false},
		{name: "plain text as txt", filename: "notes.txt", content: plainText, wantErr: false},
		{name: "disallowed executable extension", filename: "payload.exe", content: plainText, wantErr: true, wantErrLike: "not allowed"},
		{name: "no extension", filename: "noext", content: plainText, wantErr: true, wantErrLike: "not allowed"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			file := newFakeMultipartFile(tt.content)
			_, err := validateTicketAttachmentContent(tt.filename, file)
			if tt.wantErr {
				require.Error(t, err)
				assert.Contains(t, err.Error(), tt.wantErrLike)
				return
			}
			require.NoError(t, err)

			// The reader must be rewound so the caller can still upload the
			// full original content after sniffing it.
			rest, err := file.Seek(0, 1)
			require.NoError(t, err)
			assert.Equal(t, int64(0), rest, "file must be reset to the start after sniffing")
		})
	}
}

const ticketAttachmentTestBucket = "ticket-attachment-test-bucket"

// setupTicketAttachmentUploadTest prepares a fully usable storage snapshot
// (enabled, endpoint+bucket, decryptable secret) plus the uploader's user row,
// so UploadTicketAttachment can run end to end against stubbed storage calls.
func setupTicketAttachmentUploadTest(t *testing.T) {
	t.Helper()
	setupTicketControllerTest(t)
	t.Setenv(common.StorageSecretEncryptionEnv, ticketAttachmentTestEncryptionKey)
	ciphertext, err := storage_setting.EncryptSecret("upload-test-secret")
	require.NoError(t, err)
	storage_setting.LoadEncryptedSecret(ciphertext)
	storage_setting.ApplySavedSettings(storage_setting.StorageSettings{
		Version: 1,
		Enabled: true,
		Location: storage_setting.StorageLocation{
			Endpoint:      "https://acc.r2.cloudflarestorage.com",
			Region:        "auto",
			Bucket:        ticketAttachmentTestBucket,
			AccessKeyID:   "AKIAEXAMPLE",
			PublicBaseURL: "https://assets.example.com",
		},
	}, "upload-test-secret", false, true)
	t.Cleanup(func() {
		storage_setting.LoadEncryptedSecret("")
		storage_setting.ApplySavedSettings(storage_setting.StorageSettings{}, "", false, false)
	})
	require.NoError(t, model.DB.Create(&model.User{
		Id:       7,
		Username: "uploader",
		Password: "password",
		Group:    "default",
		Status:   common.UserStatusEnabled,
	}).Error)
}

// stubTicketAttachmentStorage replaces the put/delete seams; put always fails
// with putErr, delete records the object key it was asked to remove and fails
// with delErr.
func stubTicketAttachmentStorage(t *testing.T, putErr, delErr error) *[]string {
	t.Helper()
	originalPut, originalDelete := storagePutTicketAttachmentFunc, storageDeleteTicketAttachmentFunc
	deleted := make([]string, 0)
	storagePutTicketAttachmentFunc = func(_ context.Context, _ *model.TicketAttachmentUpload, _, _ string, _ io.Reader, _ int64) error {
		return putErr
	}
	storageDeleteTicketAttachmentFunc = func(_ context.Context, upload *model.TicketAttachmentUpload) error {
		deleted = append(deleted, upload.StorageKey)
		return delErr
	}
	t.Cleanup(func() {
		storagePutTicketAttachmentFunc, storageDeleteTicketAttachmentFunc = originalPut, originalDelete
	})
	return &deleted
}

func performTicketAttachmentUpload(t *testing.T, userID int) *httptest.ResponseRecorder {
	t.Helper()
	body := &bytes.Buffer{}
	writer := multipart.NewWriter(body)
	part, err := writer.CreateFormFile("file", "screenshot.png")
	require.NoError(t, err)
	_, err = part.Write([]byte{0x89, 'P', 'N', 'G', 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0})
	require.NoError(t, err)
	require.NoError(t, writer.Close())

	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Request = httptest.NewRequest(http.MethodPost, "/api/tickets/upload", body)
	ctx.Request.Header.Set("Content-Type", writer.FormDataContentType())
	ctx.Set("id", userID)
	UploadTicketAttachment(ctx)
	return recorder
}

// TestUploadTicketAttachmentPutFailureCompensatesThenReleases: a failed object
// put is not proof the object is absent (a client-side timeout can race a put
// that landed server-side), so the reservation may only be released after a
// compensating delete for the exact object key confirms the object is gone.
func TestUploadTicketAttachmentPutFailureCompensatesThenReleases(t *testing.T) {
	setupTicketAttachmentUploadTest(t)
	putErr := errors.New(`put object: Post "https://acc.r2.cloudflarestorage.com/` + ticketAttachmentTestBucket + `/resource/tickets/7/x.png": context deadline exceeded`)
	deleted := stubTicketAttachmentStorage(t, putErr, nil)

	recorder := performTicketAttachmentUpload(t, 7)

	var response map[string]any
	require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &response))
	assert.Equal(t, false, response["success"])

	require.Len(t, *deleted, 1, "an uncertain put must be compensated with a delete of the exact object key")
	assert.True(t, strings.HasPrefix((*deleted)[0], "resource/tickets/7/"), "compensating delete must target the reserved key, got %q", (*deleted)[0])

	var count int64
	require.NoError(t, model.DB.Model(&model.TicketAttachmentUpload{}).Count(&count).Error)
	assert.Zero(t, count, "a confirmed compensating delete must release the reservation")

	responseBody := recorder.Body.String()
	assert.NotContains(t, responseBody, ticketAttachmentTestBucket)
	assert.NotContains(t, responseBody, "cloudflarestorage")
	assert.NotContains(t, responseBody, (*deleted)[0])
}

// TestUploadTicketAttachmentPutFailureKeepsPendingRowWhenDeleteFails: when the
// compensating delete also fails, the object's existence is unknown, so the
// pending provenance row must survive as the only evidence the orphan cleanup
// worker can later scan, claim, and drive to an idempotent delete.
func TestUploadTicketAttachmentPutFailureKeepsPendingRowWhenDeleteFails(t *testing.T) {
	setupTicketAttachmentUploadTest(t)
	putErr := errors.New("put object: connection reset by peer")
	delErr := errors.New(`delete object: Post "https://acc.r2.cloudflarestorage.com/` + ticketAttachmentTestBucket + `/resource/tickets/7/x.png": EOF`)
	deleted := stubTicketAttachmentStorage(t, putErr, delErr)

	recorder := performTicketAttachmentUpload(t, 7)

	var response map[string]any
	require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &response))
	assert.Equal(t, false, response["success"])
	require.Len(t, *deleted, 1, "the compensating delete must still be attempted")

	var rows []model.TicketAttachmentUpload
	require.NoError(t, model.DB.Find(&rows).Error)
	require.Len(t, rows, 1, "a failed compensating delete must keep the provenance row for the cleanup worker")
	assert.True(t, rows[0].Pending, "the retained row must stay pending so it can never be attached to a message")
	assert.Zero(t, rows[0].ClaimedAt, "the retained row must be claimable by the cleanup worker")

	responseBody := recorder.Body.String()
	assert.NotContains(t, responseBody, ticketAttachmentTestBucket)
	assert.NotContains(t, responseBody, "cloudflarestorage")
	assert.NotContains(t, responseBody, rows[0].StorageKey)
}

// TestDownloadMyTicketAttachmentRejectsInternalOnlyMessage is a regression
// test: a ticket owner must not be able to download an attachment that is
// only referenced by an internal (staff-only) message on their own ticket,
// even though the ticket-ownership check alone would pass. Visibility, not
// just ownership, gates the download.
func TestDownloadMyTicketAttachmentRejectsInternalOnlyMessage(t *testing.T) {
	setupTicketControllerTest(t)
	storage_setting.ApplySavedSettings(storage_setting.StorageSettings{
		Location: storage_setting.StorageLocation{PublicBaseURL: "https://cdn.example.com/files"},
	}, "", false, false)

	ticket, _, err := model.CreateTicket(7, 7, model.TicketInitiatedByUser, model.TicketCategoryGeneral, model.TicketPriorityNormal,
		"billing question", "please help", "create-1")
	require.NoError(t, err)

	attachmentURL := "https://cdn.example.com/files/permanent/7/internal-note-screenshot.png"
	recordReadyTicketAttachmentForTest(t, "permanent/7/internal-note-screenshot.png", 100)
	_, _, err = model.ReplyToTicket(ticket.PublicId, 100, model.TicketAuthorKindStaff, model.TicketVisibilityInternal,
		"customer previously flagged for chargeback fraud, see attached", "note-1", attachmentURL)
	require.NoError(t, err)

	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Request = httptest.NewRequest(http.MethodGet, "/api/tickets/download?url="+url.QueryEscape(attachmentURL), nil)
	ctx.Set("id", 7)
	DownloadMyTicketAttachment(ctx)

	var response map[string]any
	require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &response))
	assert.Equal(t, false, response["success"],
		"the ticket owner must not be able to download an attachment referenced only by an internal-only message")
	// Must be rejected by the authorization check itself (message "attachment
	// not found"), not merely fail later for an unrelated reason (e.g. no S3
	// backend configured in this unit test) — a bare success==false assertion
	// would pass even without the visibility check, since the call would
	// still fail downstream at service.StoragePresignGet for a different
	// reason and produce the same success:false envelope.
	assert.Equal(t, "attachment not found", response["message"])
}

// TestDownloadMyTicketAttachmentAllowsPublicMessage confirms the fix above
// did not also break the legitimate case: an attachment referenced by a
// public message on the caller's own ticket must still pass the
// ownership+visibility check (it fails afterwards only because no real
// storage backend is configured in this test).
func TestDownloadMyTicketAttachmentAllowsPublicMessage(t *testing.T) {
	setupTicketControllerTest(t)
	storage_setting.ApplySavedSettings(storage_setting.StorageSettings{
		Location: storage_setting.StorageLocation{PublicBaseURL: "https://cdn.example.com/files"},
	}, "", false, false)

	attachmentURL := "https://cdn.example.com/files/permanent/7/public-screenshot.png"
	recordReadyTicketAttachmentForTest(t, "permanent/7/public-screenshot.png", 7)
	ticket, _, err := model.CreateTicket(7, 7, model.TicketInitiatedByUser, model.TicketCategoryGeneral, model.TicketPriorityNormal,
		"billing question", "please help, see attached", "create-1", attachmentURL)
	require.NoError(t, err)
	_ = ticket

	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Request = httptest.NewRequest(http.MethodGet, "/api/tickets/download?url="+url.QueryEscape(attachmentURL), nil)
	ctx.Set("id", 7)
	DownloadMyTicketAttachment(ctx)

	var response map[string]any
	require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &response))
	assert.Equal(t, true, response["success"])
	data := response["data"].(map[string]any)
	issuedPath := data["url"].(string)
	assert.Contains(t, issuedPath, "/api/ticket-attachments/")
	assert.NotContains(t, issuedPath, "cdn.example.com")
	assert.NotContains(t, issuedPath, "permanent/7/public-screenshot.png")
}

// TestDownloadMyTicketAttachmentAllowsPublicMessageEvenWhenAlsoReferencedInternally
// is the regression test for the ambiguous-First() bug: the same storage key
// can be referenced by more than one message (an internal staff note, then
// later a public reply). The internal reference is created first here, so an
// unordered First() scan -- the pre-fix behavior of
// FindTicketMessageByAttachmentURL -- would return it ahead of the public
// one and wrongly reject the download even though a public reference also
// exists.
func TestDownloadMyTicketAttachmentAllowsPublicMessageEvenWhenAlsoReferencedInternally(t *testing.T) {
	setupTicketControllerTest(t)
	storage_setting.ApplySavedSettings(storage_setting.StorageSettings{
		Location: storage_setting.StorageLocation{PublicBaseURL: "https://cdn.example.com/files"},
	}, "", false, false)

	attachmentURL := "https://cdn.example.com/files/permanent/7/shared-screenshot.png"
	// Both references below must come from the same actor (100): a storage
	// key can only be attached by whoever actually uploaded it (see
	// model.claimTicketAttachmentUploadsForMessage), so this can't be split
	// across a staff-authored internal note and a customer-authored public
	// reply the way the original version of this test did.
	recordReadyTicketAttachmentForTest(t, "permanent/7/shared-screenshot.png", 100)
	ticket, _, err := model.CreateTicket(7, 7, model.TicketInitiatedByUser, model.TicketCategoryGeneral, model.TicketPriorityNormal,
		"billing question", "please help", "create-1")
	require.NoError(t, err)

	_, _, err = model.ReplyToTicket(ticket.PublicId, 100, model.TicketAuthorKindStaff, model.TicketVisibilityInternal,
		"internal note referencing the same key, see attached", "note-1", attachmentURL)
	require.NoError(t, err)
	_, _, err = model.ReplyToTicket(ticket.PublicId, 100, model.TicketAuthorKindStaff, model.TicketVisibilityPublic,
		"see attached", "reply-1", attachmentURL)
	require.NoError(t, err)

	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Request = httptest.NewRequest(http.MethodGet, "/api/tickets/download?url="+url.QueryEscape(attachmentURL), nil)
	ctx.Set("id", 7)
	DownloadMyTicketAttachment(ctx)

	var response map[string]any
	require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &response))
	assert.Equal(t, true, response["success"],
		"a public reference must clear the authorization check even when the same key is also referenced by an internal-only message")
}

func TestServeTicketAttachmentRejectsExpiredAndTamperedCapabilities(t *testing.T) {
	setupTicketControllerTest(t)
	publicID := "492ae31e-e0f6-4df2-b5a1-4d731d7e9048"

	for _, tc := range []struct {
		name      string
		expires   int64
		signature string
	}{
		{name: "expired", expires: time.Now().Add(-time.Minute).Unix(), signature: "unused"},
		{name: "tampered", expires: time.Now().Add(time.Minute).Unix(), signature: "invalid"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			recorder := httptest.NewRecorder()
			ctx, _ := gin.CreateTestContext(recorder)
			ctx.Params = gin.Params{{Key: "public_id", Value: publicID}}
			ctx.Request = httptest.NewRequest(http.MethodGet, fmt.Sprintf("/api/ticket-attachments/%s?expires=%d&signature=%s", publicID, tc.expires, tc.signature), nil)

			ServeTicketAttachment(ctx)

			assert.Equal(t, http.StatusForbidden, recorder.Code)
		})
	}
}
