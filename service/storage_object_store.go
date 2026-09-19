package service

import (
	"bytes"
	"context"
	"crypto/sha256"
	"errors"
	"fmt"
	"io"
	"mime"
	"path"
	"strings"
	"sync"
	"time"

	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting/storage_setting"
	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/aws/retry"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	smithy "github.com/aws/smithy-go"
	"github.com/google/uuid"
)

// storageRetryer wraps the SDK's default standard retryer but refuses to
// retry a storageDialBlockedError (see storage_http_client.go): that error
// means every resolved address was refused by our own IP policy, a
// deterministic outcome that retrying can never change. Genuine transient
// errors from a real, reachable endpoint still get the SDK's normal
// exponential-backoff retry behavior.
type storageRetryer struct {
	aws.Retryer
}

func newStorageRetryer() aws.Retryer {
	return storageRetryer{Retryer: retry.NewStandard()}
}

func (r storageRetryer) IsErrorRetryable(err error) bool {
	var blocked *storageDialBlockedError
	if errors.As(err, &blocked) {
		return false
	}
	return r.Retryer.IsErrorRetryable(err)
}

const storageClientTimeout = 30 * time.Second

// ErrStorageUnavailable is returned when object storage is not usable (disabled,
// no key, undecryptable secret, or missing endpoint/bucket).
var ErrStorageUnavailable = errors.New("object storage is not available")

// cachedStorageClient pins a built client to the config version it was built
// for. Any settings or secret change bumps the version, so the version alone is
// a sufficient cache key.
type cachedStorageClient struct {
	version int64
	// secretFingerprint keys the cache on the secret's value as well as the
	// config version: the bundle and the secret are two separate options
	// applied non-atomically during cross-instance option sync, so a replica
	// can observe (new version, old secret) first and only later receive the
	// rotated secret -- with no version change. A version-only cache would
	// keep signing with the revoked credential until the next version bump
	// or restart, silently defeating the rotation.
	secretFingerprint [sha256.Size]byte
	client            *s3.Client
	bucket            string
}

var (
	storageClientMu    sync.Mutex
	storageClientCache *cachedStorageClient
)

// getStorageClient returns an S3 client for the active config plus its bucket,
// rebuilding it when the config version or the secret changed.
func getStorageClient() (*s3.Client, string, error) {
	if available, reason := storage_setting.Availability(); !available {
		return nil, "", fmt.Errorf("%w: %s", ErrStorageUnavailable, reason)
	}
	snapshot := storage_setting.GetStorageSettings()
	secret, ok := storage_setting.SecretAccessKey()
	if !ok {
		return nil, "", fmt.Errorf("%w: secret unavailable", ErrStorageUnavailable)
	}
	fingerprint := sha256.Sum256([]byte(secret))
	storageClientMu.Lock()
	defer storageClientMu.Unlock()
	if storageClientCache != nil && storageClientCache.version == snapshot.Version && storageClientCache.secretFingerprint == fingerprint {
		return storageClientCache.client, storageClientCache.bucket, nil
	}
	client := buildS3Client(snapshot, secret)
	storageClientCache = &cachedStorageClient{version: snapshot.Version, secretFingerprint: fingerprint, client: client, bucket: snapshot.Location.Bucket}
	return client, snapshot.Location.Bucket, nil
}

// buildS3Client constructs an S3 client from static credentials over the
// SSRF-hardened transport. It never uses LoadDefaultConfig, so ambient
// environment or instance credentials cannot leak in. It uses storageRetryer
// so an SSRF-policy-blocked dial fails on the first attempt instead of being
// retried as if it were a transient network error.
func buildS3Client(s storage_setting.StorageSettings, secret string) *s3.Client {
	region := s.Location.Region
	if region == "" {
		region = "auto" // Cloudflare R2 convention
	}
	httpClient := newStorageHTTPClient(s.Location.AllowPrivateEndpoint, storageClientTimeout)
	return s3.New(s3.Options{
		Region:       region,
		Credentials:  credentials.NewStaticCredentialsProvider(s.Location.AccessKeyID, secret, ""),
		BaseEndpoint: aws.String(s.Location.Endpoint),
		UsePathStyle: s.Location.ForcePathStyle,
		HTTPClient:   httpClient,
		Retryer:      newStorageRetryer(),
	})
}

// StoragePutObject streams body to key. size < 0 means unknown length.
func StoragePutObject(ctx context.Context, key, contentType string, body io.Reader, size int64) error {
	client, bucket, err := getStorageClient()
	if err != nil {
		return err
	}
	input := &s3.PutObjectInput{Bucket: aws.String(bucket), Key: aws.String(key), Body: body}
	if contentType != "" {
		input.ContentType = aws.String(contentType)
	}
	if size >= 0 {
		input.ContentLength = aws.Int64(size)
	}
	if _, err := client.PutObject(ctx, input); err != nil {
		return fmt.Errorf("put object: %w", err)
	}
	return nil
}

// StoragePutTicketAttachment writes through the exact settings snapshot that
// was persisted with the upload reservation. A concurrent settings update can
// therefore never split DB provenance from the actual object destination.
func StoragePutTicketAttachment(ctx context.Context, upload *model.TicketAttachmentUpload, plaintextSecret, contentType string, body io.Reader, size int64) error {
	placement, err := upload.StoragePlacement()
	if err != nil {
		return err
	}
	settings := storage_setting.StorageSettings{Version: placement.Version, Enabled: true, Location: placement.Location}
	client := buildS3Client(settings, plaintextSecret)
	input := &s3.PutObjectInput{Bucket: aws.String(placement.Location.Bucket), Key: aws.String(upload.StorageKey), Body: body}
	if contentType != "" {
		input.ContentType = aws.String(contentType)
	}
	if size >= 0 {
		input.ContentLength = aws.Int64(size)
	}
	if _, err := client.PutObject(ctx, input); err != nil {
		return fmt.Errorf("put object: %w", err)
	}
	return nil
}

func ticketAttachmentStorageClient(upload *model.TicketAttachmentUpload) (*s3.Client, string, error) {
	placement, err := upload.StoragePlacement()
	if err != nil {
		return nil, "", err
	}
	secret, err := storage_setting.DecryptSecret(placement.SecretCiphertext)
	if err != nil {
		return nil, "", fmt.Errorf("decrypt attachment storage credential: %w", err)
	}
	settings := storage_setting.StorageSettings{Version: placement.Version, Enabled: true, Location: placement.Location}
	return buildS3Client(settings, secret), placement.Location.Bucket, nil
}

func StorageGetTicketAttachment(ctx context.Context, upload *model.TicketAttachmentUpload) (io.ReadCloser, string, error) {
	client, bucket, err := ticketAttachmentStorageClient(upload)
	if err != nil {
		return nil, "", err
	}
	out, err := client.GetObject(ctx, &s3.GetObjectInput{Bucket: aws.String(bucket), Key: aws.String(upload.StorageKey)})
	if err != nil {
		return nil, "", fmt.Errorf("get object: %w", err)
	}
	contentType := ""
	if out.ContentType != nil {
		contentType = *out.ContentType
	}
	return out.Body, contentType, nil
}

func StorageDeleteTicketAttachment(ctx context.Context, upload *model.TicketAttachmentUpload) error {
	client, bucket, err := ticketAttachmentStorageClient(upload)
	if err != nil {
		return err
	}
	if _, err := client.DeleteObject(ctx, &s3.DeleteObjectInput{Bucket: aws.String(bucket), Key: aws.String(upload.StorageKey)}); err != nil {
		return fmt.Errorf("delete object: %w", err)
	}
	return nil
}

func StoragePresignTicketAttachment(ctx context.Context, upload *model.TicketAttachmentUpload, ttl time.Duration) (string, error) {
	client, bucket, err := ticketAttachmentStorageClient(upload)
	if err != nil {
		return "", err
	}
	contentDisposition := mime.FormatMediaType("attachment", map[string]string{"filename": upload.OriginalName})
	req, err := s3.NewPresignClient(client).PresignGetObject(ctx, &s3.GetObjectInput{
		Bucket:                     aws.String(bucket),
		Key:                        aws.String(upload.StorageKey),
		ResponseContentDisposition: aws.String(contentDisposition),
	}, s3.WithPresignExpires(ttl))
	if err != nil {
		return "", fmt.Errorf("presign get object: %w", err)
	}
	return req.URL, nil
}

// StorageGetObject opens key for reading, returning the body and content type.
func StorageGetObject(ctx context.Context, key string) (io.ReadCloser, string, error) {
	client, bucket, err := getStorageClient()
	if err != nil {
		return nil, "", err
	}
	out, err := client.GetObject(ctx, &s3.GetObjectInput{Bucket: aws.String(bucket), Key: aws.String(key)})
	if err != nil {
		return nil, "", fmt.Errorf("get object: %w", err)
	}
	contentType := ""
	if out.ContentType != nil {
		contentType = *out.ContentType
	}
	return out.Body, contentType, nil
}

// StorageHeadObject returns the object size, confirming existence.
func StorageHeadObject(ctx context.Context, key string) (int64, error) {
	client, bucket, err := getStorageClient()
	if err != nil {
		return 0, err
	}
	out, err := client.HeadObject(ctx, &s3.HeadObjectInput{Bucket: aws.String(bucket), Key: aws.String(key)})
	if err != nil {
		return 0, fmt.Errorf("head object: %w", err)
	}
	if out.ContentLength != nil {
		return *out.ContentLength, nil
	}
	return 0, nil
}

// StorageDeleteObject removes key.
func StorageDeleteObject(ctx context.Context, key string) error {
	client, bucket, err := getStorageClient()
	if err != nil {
		return err
	}
	if _, err := client.DeleteObject(ctx, &s3.DeleteObjectInput{Bucket: aws.String(bucket), Key: aws.String(key)}); err != nil {
		return fmt.Errorf("delete object: %w", err)
	}
	return nil
}

// StoragePresignGet returns a short-lived presigned URL for key. inline is
// reserved for browser-safe image previews; every other attachment is served
// with Content-Disposition: attachment so a cross-origin redirect still
// produces a download instead of replacing the application page.
func StoragePresignGet(ctx context.Context, key string, ttl time.Duration, inline bool) (string, error) {
	client, bucket, err := getStorageClient()
	if err != nil {
		return "", err
	}
	presign := s3.NewPresignClient(client)
	disposition := "attachment"
	if inline {
		disposition = "inline"
	}
	contentDisposition := mime.FormatMediaType(disposition, map[string]string{"filename": path.Base(key)})
	req, err := presign.PresignGetObject(ctx, &s3.GetObjectInput{
		Bucket:                     aws.String(bucket),
		Key:                        aws.String(key),
		ResponseContentDisposition: aws.String(contentDisposition),
	}, s3.WithPresignExpires(ttl))
	if err != nil {
		return "", fmt.Errorf("presign get object: %w", err)
	}
	return req.URL, nil
}

// BuildTicketAttachmentKey generates the storage key for a ticket attachment.
// A file is uploaded independently of any specific ticket — the create/reply
// forms collect each upload's returned URL client-side and submit the whole
// list together with the ticket message — so the key is scoped by the
// uploading user, not a ticket id. Always generates a random name and
// deliberately ignores storage_setting.Policies.PreservePath: a ticket
// attachment key must be immutable and collision-free, because reusing the
// original filename as the key lets a second upload with the same name
// silently overwrite an object a prior ticket message already references.
func BuildTicketAttachmentKey(uploaderUserID int, originalFilename string) string {
	policies := storage_setting.GetStorageSettings().Policies
	base := fmt.Sprintf("%s/tickets/%d", strings.TrimSuffix(policies.ResourcePrefix, "/"), uploaderUserID)
	ext := path.Ext(originalFilename)
	return base + "/" + uuid.NewString() + ext
}

// StorageTestStep is one stage of a connection test.
type StorageTestStep struct {
	Name  string `json:"name"`
	OK    bool   `json:"ok"`
	Error string `json:"error,omitempty"`
}

// StorageTestResult is the staged outcome of StorageTestConnection. It never
// includes credentials, authorization headers, or presigned queries.
type StorageTestResult struct {
	Success   bool              `json:"success"`
	Steps     []StorageTestStep `json:"steps"`
	RequestID string            `json:"request_id"`
}

// StorageTestConnection exercises real Put/Head/Get/Delete against a temporary
// health object so the test proves actual read/write/delete permission rather
// than mere bucket existence. It cleans up the object it writes.
func StorageTestConnection(ctx context.Context, requestID string) StorageTestResult {
	result := StorageTestResult{RequestID: requestID}
	snapshot := storage_setting.GetStorageSettings()
	key := strings.TrimSuffix(snapshot.Policies.TemporaryPrefix, "/") + "/_health/" + uuid.NewString()
	payload := []byte("new-api storage health check")

	put := StorageTestStep{Name: "put"}
	if err := StoragePutObject(ctx, key, "text/plain", bytes.NewReader(payload), int64(len(payload))); err != nil {
		put.Error = redactStorageError(err)
		result.Steps = append(result.Steps, put)
		return result
	}
	put.OK = true
	result.Steps = append(result.Steps, put)

	head := StorageTestStep{Name: "head"}
	if _, err := StorageHeadObject(ctx, key); err != nil {
		head.Error = redactStorageError(err)
	} else {
		head.OK = true
	}
	result.Steps = append(result.Steps, head)

	get := StorageTestStep{Name: "get"}
	if body, _, err := StorageGetObject(ctx, key); err != nil {
		get.Error = redactStorageError(err)
	} else {
		_, _ = io.Copy(io.Discard, body)
		_ = body.Close()
		get.OK = true
	}
	result.Steps = append(result.Steps, get)

	del := StorageTestStep{Name: "delete"}
	if err := StorageDeleteObject(ctx, key); err != nil {
		del.Error = redactStorageError(err)
	} else {
		del.OK = true
	}
	result.Steps = append(result.Steps, del)

	result.Success = put.OK && head.OK && get.OK && del.OK
	return result
}

// redactStorageError reduces an S3 error to a diagnosable, secret-free form:
// the API error code when available, otherwise the message truncated before any
// presigned query so signatures and credentials never surface.
func redactStorageError(err error) string {
	if err == nil {
		return ""
	}
	var apiErr smithy.APIError
	if errors.As(err, &apiErr) {
		return apiErr.ErrorCode()
	}
	msg := err.Error()
	if i := strings.Index(msg, "?X-Amz"); i >= 0 {
		msg = msg[:i]
	}
	return msg
}
