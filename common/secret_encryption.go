package common

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/base64"
	"errors"
	"fmt"
	"io"
	"os"
	"strings"
	"sync"
)

// StorageSecretEncryptionEnv is the environment variable holding the stable
// base64-encoded 32-byte key used to encrypt persisted object-storage secrets.
//
// The key MUST be stable across restarts and identical on every instance:
// storage secrets are AES-256-GCM encrypted at rest with it, so a lost or
// rotated key makes the persisted secret undecryptable. It is deliberately
// separate from CryptoSecret/SessionSecret, which fall back to a random
// per-boot value (see common/init.go) and therefore cannot protect data that
// must survive a restart.
const StorageSecretEncryptionEnv = "STORAGE_SECRET_ENCRYPTION_KEY"

// storageSecretCiphertextPrefix versions the on-disk ciphertext format so the
// scheme can evolve without ambiguity. Format: "v1:" + base64(nonce || ct).
const storageSecretCiphertextPrefix = "v1:"

// ErrStorageSecretKeyUnavailable is returned when no valid storage encryption
// key is configured. Callers must treat storage as unable to accept or use a
// secret rather than falling back to plaintext or an empty secret.
var ErrStorageSecretKeyUnavailable = errors.New("storage secret encryption key is not configured")

// storageSecretKey is loaded once from the environment. Loading is lazy so
// tests can set the env var before first use; a malformed key resolves to a
// nil key (unavailable) with the load error retained for diagnostics. Tests in
// this package may reassign loadStorageSecretKey to a fresh OnceValues over
// readStorageSecretKeyFromEnv after changing the env var.
var loadStorageSecretKey = sync.OnceValues(readStorageSecretKeyFromEnv)

func readStorageSecretKeyFromEnv() ([]byte, error) {
	raw := strings.TrimSpace(os.Getenv(StorageSecretEncryptionEnv))
	if raw == "" {
		return nil, ErrStorageSecretKeyUnavailable
	}
	key, err := base64.StdEncoding.DecodeString(raw)
	if err != nil {
		return nil, fmt.Errorf("decode %s: %w", StorageSecretEncryptionEnv, err)
	}
	if len(key) != 32 {
		return nil, fmt.Errorf("%s must decode to 32 bytes, got %d", StorageSecretEncryptionEnv, len(key))
	}
	return key, nil
}

// StorageSecretEncryptionAvailable reports whether a valid encryption key is
// configured. When false, storage settings may be read in redacted form but a
// secret must not be saved and storage must not be enabled.
func StorageSecretEncryptionAvailable() bool {
	key, err := loadStorageSecretKey()
	return err == nil && len(key) == 32
}

// storageSecretGCM builds the AEAD for the configured key.
func storageSecretGCM() (cipher.AEAD, error) {
	key, err := loadStorageSecretKey()
	if err != nil {
		return nil, err
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, fmt.Errorf("init storage secret cipher: %w", err)
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, fmt.Errorf("init storage secret gcm: %w", err)
	}
	return gcm, nil
}

// storageSecretAAD binds ciphertext to a purpose string so a secret encrypted
// for one field cannot be transplanted into another.
func storageSecretAAD(context string) []byte {
	return []byte("new-api:storage:" + context)
}

// EncryptStorageSecret AES-256-GCM encrypts plaintext under a fresh random
// nonce, authenticating it with a purpose-bound AAD. The returned value is
// self-describing ("v1:...") and safe to persist. An empty plaintext is
// rejected — callers clear a secret by deleting the stored value, not by
// encrypting "".
func EncryptStorageSecret(plaintext, context string) (string, error) {
	if plaintext == "" {
		return "", errors.New("cannot encrypt empty storage secret")
	}
	gcm, err := storageSecretGCM()
	if err != nil {
		return "", err
	}
	nonce := make([]byte, gcm.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return "", fmt.Errorf("generate storage secret nonce: %w", err)
	}
	sealed := gcm.Seal(nonce, nonce, []byte(plaintext), storageSecretAAD(context))
	return storageSecretCiphertextPrefix + base64.StdEncoding.EncodeToString(sealed), nil
}

// DecryptStorageSecret reverses EncryptStorageSecret. A key mismatch, tampered
// ciphertext, or wrong context all surface as an error; the caller must fail
// loud (mark storage unavailable) rather than proceed with a blank secret.
func DecryptStorageSecret(ciphertext, context string) (string, error) {
	if ciphertext == "" {
		return "", errors.New("cannot decrypt empty storage secret")
	}
	if !strings.HasPrefix(ciphertext, storageSecretCiphertextPrefix) {
		return "", errors.New("unsupported storage secret ciphertext format")
	}
	gcm, err := storageSecretGCM()
	if err != nil {
		return "", err
	}
	sealed, err := base64.StdEncoding.DecodeString(strings.TrimPrefix(ciphertext, storageSecretCiphertextPrefix))
	if err != nil {
		return "", fmt.Errorf("decode storage secret ciphertext: %w", err)
	}
	if len(sealed) < gcm.NonceSize() {
		return "", errors.New("storage secret ciphertext is too short")
	}
	nonce, ct := sealed[:gcm.NonceSize()], sealed[gcm.NonceSize():]
	plaintext, err := gcm.Open(nil, nonce, ct, storageSecretAAD(context))
	if err != nil {
		return "", fmt.Errorf("decrypt storage secret: %w", err)
	}
	return string(plaintext), nil
}
