// Package storage_setting holds the versioned, in-memory snapshot of the
// object-storage configuration. The secret access key is never part of the
// non-secret bundle: it is persisted separately as AES-256-GCM ciphertext and
// held here only in decrypted form for the S3 client to use at runtime.
package storage_setting

import (
	"fmt"
	"net/url"
	"os"
	"strings"
	"sync"

	"github.com/QuantumNous/new-api/common"
)

const (
	// secretEncryptionContext binds the persisted secret ciphertext to this field.
	secretEncryptionContext = "secret_access_key"

	DefaultTemporaryPrefix = "temporary/"
	DefaultPermanentPrefix = "permanent/"
	DefaultResourcePrefix  = "resource/"
)

// StorageLocation is one S3-compatible endpoint. Three logical purposes share
// it via prefixes (see StoragePolicySettings) rather than three credential sets.
type StorageLocation struct {
	Endpoint             string `json:"endpoint"`
	Region               string `json:"region"`
	Bucket               string `json:"bucket"`
	AccessKeyID          string `json:"access_key_id"`
	ForcePathStyle       bool   `json:"force_path_style"`
	PublicBaseURL        string `json:"public_base_url"`
	AllowPrivateEndpoint bool   `json:"allow_private_endpoint"`
}

// StoragePolicySettings maps the temporary/permanent/resource purposes to key
// prefixes within the single bucket.
type StoragePolicySettings struct {
	TemporaryPrefix string `json:"temporary_prefix"`
	PermanentPrefix string `json:"permanent_prefix"`
	ResourcePrefix  string `json:"resource_prefix"`
	// PreservePath, when true, builds an uploaded object's key from its
	// original filename instead of a generated random name. Off by default:
	// a generated name avoids same-name collisions between unrelated uploads.
	PreservePath bool `json:"preserve_path"`
}

// StorageSettings is the non-secret, versioned bundle persisted as one option.
type StorageSettings struct {
	Version  int64                 `json:"version"`
	Enabled  bool                  `json:"enabled"`
	Location StorageLocation       `json:"location"`
	Policies StoragePolicySettings `json:"policies"`
}

var (
	mu          sync.RWMutex
	settings    = StorageSettings{Policies: defaultPolicies()}
	secret      string // decrypted secret access key, in-memory only
	hasSecret   bool   // a secret ciphertext is persisted
	secretError string // non-empty when a persisted secret could not be decrypted
)

// EncryptSecret encrypts a plaintext secret access key with the field-bound
// AAD context, ready for persistence. Callers never construct the context.
func EncryptSecret(plaintext string) (string, error) {
	return common.EncryptStorageSecret(plaintext, secretEncryptionContext)
}

func defaultPolicies() StoragePolicySettings {
	return StoragePolicySettings{
		TemporaryPrefix: DefaultTemporaryPrefix,
		PermanentPrefix: DefaultPermanentPrefix,
		ResourcePrefix:  DefaultResourcePrefix,
	}
}

// GetStorageSettings returns a copy of the non-secret snapshot.
func GetStorageSettings() StorageSettings {
	mu.RLock()
	defer mu.RUnlock()
	return settings
}

// PublicBaseURL returns the configured public object URL prefix with exactly
// one trailing slash. Ticket validation and download paths share this helper
// so they cannot disagree on which URLs belong to this storage instance.
func PublicBaseURL() (string, error) {
	base := strings.TrimSpace(GetStorageSettings().Location.PublicBaseURL)
	if base == "" {
		return "", fmt.Errorf("attachments are unavailable: storage has no public base URL configured")
	}
	return strings.TrimRight(base, "/") + "/", nil
}

// Version returns the current persisted config version for CAS.
func Version() int64 {
	mu.RLock()
	defer mu.RUnlock()
	return settings.Version
}

// BundleJSON marshals the current non-secret snapshot for persistence/seeding.
func BundleJSON() string {
	data, err := common.Marshal(GetStorageSettings())
	if err != nil {
		return ""
	}
	return string(data)
}

// HasSecretAccessKey reports whether a secret is persisted (regardless of
// whether it currently decrypts). GET responses expose only this boolean.
func HasSecretAccessKey() bool {
	mu.RLock()
	defer mu.RUnlock()
	return hasSecret
}

// SecretAccessKey returns the decrypted secret for client use. The second
// return is false when no usable secret is available.
func SecretAccessKey() (string, bool) {
	mu.RLock()
	defer mu.RUnlock()
	if secret == "" {
		return "", false
	}
	return secret, true
}

// SnapshotForUse returns one internally consistent settings-and-secret pair.
// Callers that persist object placement must use this instead of reading the
// two values separately, because an option refresh can rotate either value
// between independent reads.
func SnapshotForUse() (StorageSettings, string, error) {
	mu.RLock()
	defer mu.RUnlock()
	switch {
	case !settings.Enabled:
		return StorageSettings{}, "", fmt.Errorf("storage disabled")
	case secretError != "":
		return StorageSettings{}, "", fmt.Errorf("secret undecryptable: %s", secretError)
	case !hasSecret || secret == "":
		return StorageSettings{}, "", fmt.Errorf("secret access key not set")
	case strings.TrimSpace(settings.Location.Endpoint) == "" || strings.TrimSpace(settings.Location.Bucket) == "":
		return StorageSettings{}, "", fmt.Errorf("endpoint or bucket not set")
	default:
		return settings, secret, nil
	}
}

// DecryptSecret decrypts a persisted snapshot credential using the same
// purpose-bound context as the active storage option.
func DecryptSecret(ciphertext string) (string, error) {
	return common.DecryptStorageSecret(ciphertext, secretEncryptionContext)
}

// Availability reports whether object storage is usable right now and, when
// not, a redacted reason. Storage is unavailable unless it is enabled, the
// encryption key is configured, a secret is present, and that secret decrypted.
func Availability() (bool, string) {
	mu.RLock()
	defer mu.RUnlock()
	switch {
	case !settings.Enabled:
		return false, "storage disabled"
	case secretError != "":
		return false, "secret undecryptable: " + secretError
	case !hasSecret || secret == "":
		return false, "secret access key not set"
	case strings.TrimSpace(settings.Location.Endpoint) == "" || strings.TrimSpace(settings.Location.Bucket) == "":
		return false, "endpoint or bucket not set"
	default:
		return true, ""
	}
}

// LoadTicketAttachmentEnvironment configures the ticket attachment store
// without exposing a general-purpose storage administration API. An empty
// endpoint leaves attachments disabled.
func LoadTicketAttachmentEnvironment() error {
	endpoint := strings.TrimSpace(os.Getenv("TICKET_STORAGE_ENDPOINT"))
	if endpoint == "" {
		return nil
	}
	forcePathStyle := common.GetEnvOrDefaultBool("TICKET_STORAGE_FORCE_PATH_STYLE", false)
	allowPrivateEndpoint := common.GetEnvOrDefaultBool("TICKET_STORAGE_ALLOW_PRIVATE_ENDPOINT", false)
	settings := NormalizeForSave(StorageSettings{
		Version: 1,
		Enabled: true,
		Location: StorageLocation{
			Endpoint:             endpoint,
			Region:               os.Getenv("TICKET_STORAGE_REGION"),
			Bucket:               os.Getenv("TICKET_STORAGE_BUCKET"),
			AccessKeyID:          os.Getenv("TICKET_STORAGE_ACCESS_KEY_ID"),
			ForcePathStyle:       forcePathStyle,
			PublicBaseURL:        os.Getenv("TICKET_STORAGE_PUBLIC_BASE_URL"),
			AllowPrivateEndpoint: allowPrivateEndpoint,
		},
		Policies: defaultPolicies(),
	})
	secretAccessKey := strings.TrimSpace(os.Getenv("TICKET_STORAGE_SECRET_ACCESS_KEY"))
	if settings.Location.Bucket == "" || settings.Location.AccessKeyID == "" || settings.Location.PublicBaseURL == "" || secretAccessKey == "" {
		return fmt.Errorf("ticket storage requires bucket, access key id, secret access key, and public base URL")
	}
	ApplySavedSettings(settings, secretAccessKey, false, true)
	return nil
}

// LoadBundle applies the persisted non-secret bundle (called from updateOptionMap).
func LoadBundle(jsonStr string) error {
	jsonStr = strings.TrimSpace(jsonStr)
	if jsonStr == "" {
		return nil
	}
	var loaded StorageSettings
	if err := common.Unmarshal([]byte(jsonStr), &loaded); err != nil {
		return fmt.Errorf("parse storage settings bundle: %w", err)
	}
	loaded.Policies = normalizePolicies(loaded.Policies)
	mu.Lock()
	settings = loaded
	mu.Unlock()
	return nil
}

// LoadEncryptedSecret decrypts and applies the persisted secret ciphertext
// (called from updateOptionMap). A decrypt failure is recorded so Availability
// reports unavailable instead of silently continuing with no secret.
func LoadEncryptedSecret(ciphertext string) {
	ciphertext = strings.TrimSpace(ciphertext)
	mu.Lock()
	defer mu.Unlock()
	if ciphertext == "" {
		secret, hasSecret, secretError = "", false, ""
		return
	}
	hasSecret = true
	plaintext, err := common.DecryptStorageSecret(ciphertext, secretEncryptionContext)
	if err != nil {
		secret, secretError = "", err.Error()
		common.SysError("failed to decrypt persisted storage secret: " + err.Error())
		return
	}
	secret, secretError = plaintext, ""
}

// ApplySavedSettings updates the runtime snapshot after a successful atomic
// save. plaintextSecret is the decrypted secret to hold in memory; retainSecret
// keeps the existing in-memory secret unchanged (secret field omitted in PUT).
func ApplySavedSettings(saved StorageSettings, plaintextSecret string, retainSecret, secretPersisted bool) {
	saved.Policies = normalizePolicies(saved.Policies)
	mu.Lock()
	defer mu.Unlock()
	settings = saved
	if retainSecret {
		return
	}
	secretError = ""
	if secretPersisted {
		secret, hasSecret = plaintextSecret, true
	} else {
		secret, hasSecret = "", false
	}
}

// NormalizeForSave trims location fields and normalizes prefixes, producing the
// canonical form to persist and apply.
func NormalizeForSave(s StorageSettings) StorageSettings {
	s.Location.Endpoint = strings.TrimSpace(s.Location.Endpoint)
	s.Location.Region = strings.TrimSpace(s.Location.Region)
	s.Location.Bucket = strings.TrimSpace(s.Location.Bucket)
	s.Location.AccessKeyID = strings.TrimSpace(s.Location.AccessKeyID)
	s.Location.PublicBaseURL = strings.TrimSpace(s.Location.PublicBaseURL)
	s.Policies = normalizePolicies(s.Policies)
	return s
}

func normalizePolicies(p StoragePolicySettings) StoragePolicySettings {
	p.TemporaryPrefix = normalizePrefix(p.TemporaryPrefix, DefaultTemporaryPrefix)
	p.PermanentPrefix = normalizePrefix(p.PermanentPrefix, DefaultPermanentPrefix)
	p.ResourcePrefix = normalizePrefix(p.ResourcePrefix, DefaultResourcePrefix)
	return p
}

// normalizePrefix trims and guarantees a single trailing slash, no leading
// slash. Empty falls back to the provided default.
func normalizePrefix(value, fallback string) string {
	value = strings.TrimSpace(value)
	if value == "" {
		return fallback
	}
	value = strings.Trim(value, "/")
	if value == "" {
		return fallback
	}
	return value + "/"
}

// ValidateEndpoint enforces the endpoint-string contract shared by the settings
// controller and (later) the S3 dial guard: HTTPS only, an origin with no
// userinfo/query/fragment/path. Runtime private-IP/DNS-rebinding protection is
// enforced separately at dial time by the storage HTTP client.
func ValidateEndpoint(rawEndpoint string) error {
	rawEndpoint = strings.TrimSpace(rawEndpoint)
	if rawEndpoint == "" {
		return fmt.Errorf("storage endpoint is required")
	}
	parsed, err := url.Parse(rawEndpoint)
	if err != nil {
		return fmt.Errorf("invalid storage endpoint: %w", err)
	}
	if parsed.Scheme != "https" {
		return fmt.Errorf("storage endpoint must use https")
	}
	if parsed.Host == "" {
		return fmt.Errorf("storage endpoint must include a host")
	}
	if parsed.User != nil {
		return fmt.Errorf("storage endpoint must not contain credentials")
	}
	if parsed.RawQuery != "" || parsed.Fragment != "" {
		return fmt.Errorf("storage endpoint must not contain a query or fragment")
	}
	if path := strings.Trim(parsed.Path, "/"); path != "" {
		return fmt.Errorf("storage endpoint must be an origin without a path")
	}
	return nil
}
