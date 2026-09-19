package service

import (
	"net/netip"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestValidateStorageIP(t *testing.T) {
	cases := []struct {
		name         string
		ip           string
		allowPrivate bool
		wantErr      bool
	}{
		{"public ipv4", "13.226.1.1", false, false},
		{"public ipv6", "2606:4700::1", false, false},
		{"loopback blocked", "127.0.0.1", false, true},
		{"loopback allowed when private ok", "127.0.0.1", true, false},
		{"private 10 blocked", "10.0.0.5", false, true},
		{"private 192.168 allowed", "192.168.1.10", true, false},
		{"private 172.16 blocked", "172.16.0.1", false, true},
		{"metadata link-local always blocked", "169.254.169.254", false, true},
		{"metadata blocked even when private allowed", "169.254.169.254", true, true},
		{"ipv6 link-local always blocked", "fe80::1", true, true},
		{"unspecified blocked", "0.0.0.0", true, true},
		{"multicast blocked", "224.0.0.1", true, true},
		{"ipv4-mapped loopback blocked", "::ffff:127.0.0.1", false, true},
		// Ranges the hand-rolled IsLoopback()/IsPrivate() pair used to let
		// through; they are only reachable now with allowPrivate set.
		{"alibaba metadata blocked", "100.100.100.200", false, true},
		{"cgnat blocked", "100.64.0.1", false, true},
		{"cgnat allowed when private ok", "100.64.0.1", true, false},
		{"ietf protocol assignment blocked", "192.0.0.1", false, true},
		{"benchmark range blocked", "198.18.0.1", false, true},
		{"reserved class e blocked", "240.0.0.1", false, true},
		{"nat64 blocked", "64:ff9b::7f00:1", false, true},
		{"ipv6 ula blocked", "fc00::1", false, true},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			addr, err := netip.ParseAddr(tc.ip)
			require.NoError(t, err)
			err = validateStorageIP(addr, tc.allowPrivate)
			if tc.wantErr {
				require.Error(t, err)
			} else {
				require.NoError(t, err)
			}
		})
	}
}
