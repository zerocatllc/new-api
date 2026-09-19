package service

import (
	"context"
	"crypto/tls"
	"errors"
	"fmt"
	"net"
	"net/http"
	"net/netip"
	"time"

	"github.com/QuantumNous/new-api/common"
)

// errStorageRedirectBlocked is returned by the storage client's CheckRedirect:
// object-storage APIs never legitimately redirect, and following one would let
// a hostile endpoint bounce the request to an internal target.
var errStorageRedirectBlocked = errors.New("storage client does not follow redirects")

// storageDialBlockedError marks a dial refused because every resolved
// candidate address failed our own IP policy check. The AWS SDK's default
// retryer treats any pre-response transport error as a potentially-retryable
// connection error, so without this a deterministic SSRF refusal would be
// retried with backoff as if it were a transient network blip — wasting
// several seconds on every blocked endpoint, including the connection-test
// action whose whole point is a fast, diagnosable result. storageRetryer
// (storage_object_store.go) checks for this type via errors.As and refuses to
// retry it, while still retrying genuine transient errors normally.
type storageDialBlockedError struct{ reason string }

func (e *storageDialBlockedError) Error() string { return e.reason }

// validateStorageIP decides whether a resolved address may be dialed. Metadata
// and link-local ranges are refused unconditionally — there is no legitimate
// object-storage endpoint there, and 169.254.169.254 is the classic SSRF
// target. Every other special-purpose range is refused unless allowPrivate is
// set (self-hosted MinIO on a trusted network).
//
// The special-purpose ranges come from common.IsRestrictedIP rather than a
// local list. The hand-rolled `IsLoopback() || IsPrivate()` this replaced let
// through everything outside RFC1918 — notably 100.64.0.0/10, which holds
// Alibaba Cloud's metadata endpoint at 100.100.100.200.
func validateStorageIP(addr netip.Addr, allowPrivate bool) error {
	ip := addr.Unmap() // collapse IPv4-mapped IPv6 so 4-in-6 tricks can't bypass checks
	switch {
	case !ip.IsValid():
		return errors.New("invalid resolved address")
	case ip.IsUnspecified():
		return fmt.Errorf("refusing unspecified address %s", ip)
	case ip.IsMulticast() || ip.IsInterfaceLocalMulticast() || ip.IsLinkLocalMulticast():
		return fmt.Errorf("refusing multicast address %s", ip)
	case ip.IsLinkLocalUnicast():
		// covers 169.254.0.0/16 (incl. cloud metadata) and fe80::/10
		return fmt.Errorf("refusing link-local address %s", ip)
	case common.IsRestrictedIP(net.IP(ip.AsSlice())):
		if allowPrivate {
			return nil
		}
		return fmt.Errorf("refusing restricted address %s", ip)
	default:
		return nil
	}
}

// newStorageHTTPClient builds an SSRF-hardened HTTP client for the S3 endpoint.
// It resolves the host, validates every candidate IP, and dials the validated
// IP directly so a DNS rebind between validation and dial cannot occur. It
// ignores environment proxies, never follows redirects, and uses its own TLS
// config so a global insecure-skip-verify setting cannot weaken it.
func newStorageHTTPClient(allowPrivate bool, timeout time.Duration) *http.Client {
	baseDialer := &net.Dialer{Timeout: 10 * time.Second, KeepAlive: 30 * time.Second}
	transport := &http.Transport{
		Proxy: nil,
		DialContext: func(ctx context.Context, network, addr string) (net.Conn, error) {
			host, port, err := net.SplitHostPort(addr)
			if err != nil {
				return nil, err
			}
			ips, err := net.DefaultResolver.LookupNetIP(ctx, "ip", host)
			if err != nil {
				return nil, fmt.Errorf("resolve storage host: %w", err)
			}
			var lastErr error
			var anyPassedPolicy bool
			for _, ip := range ips {
				if err := validateStorageIP(ip, allowPrivate); err != nil {
					lastErr = err
					continue
				}
				anyPassedPolicy = true
				conn, derr := baseDialer.DialContext(ctx, network, net.JoinHostPort(ip.String(), port))
				if derr != nil {
					lastErr = derr
					continue
				}
				return conn, nil
			}
			if lastErr == nil {
				lastErr = fmt.Errorf("no dialable address for %s", host)
			}
			if !anyPassedPolicy {
				// Every candidate was refused by policy, not by the network: the
				// outcome is deterministic, so mark it non-retryable.
				return nil, &storageDialBlockedError{reason: lastErr.Error()}
			}
			return nil, lastErr
		},
		TLSClientConfig:       &tls.Config{MinVersion: tls.VersionTLS12},
		ForceAttemptHTTP2:     true,
		MaxIdleConns:          32,
		IdleConnTimeout:       90 * time.Second,
		TLSHandshakeTimeout:   10 * time.Second,
		ExpectContinueTimeout: time.Second,
	}
	return &http.Client{
		Timeout:   timeout,
		Transport: transport,
		CheckRedirect: func(*http.Request, []*http.Request) error {
			return errStorageRedirectBlocked
		},
	}
}
