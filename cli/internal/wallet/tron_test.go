package wallet

import (
	"bytes"
	"encoding/hex"
	"strings"
	"testing"

	"github.com/ethereum/go-ethereum/crypto"
)

func TestTronAddressFormat(t *testing.T) {
	priv, err := hex.DecodeString("0000000000000000000000000000000000000000000000000000000000000001")
	if err != nil {
		t.Fatalf("hex: %v", err)
	}

	addr, err := SecretToAddress(FamilyTron, priv)
	if err != nil {
		t.Fatalf("SecretToAddress(TRX): %v", err)
	}

	if !strings.HasPrefix(addr, "T") {
		t.Fatalf("address %q does not start with T", addr)
	}
	if l := len(addr); l < 33 || l > 35 {
		t.Fatalf("address length = %d, want 33..35", l)
	}

	body, err := DecodeTronAddress(addr)
	if err != nil {
		t.Fatalf("DecodeTronAddress: %v", err)
	}
	if len(body) != 21 {
		t.Fatalf("decoded body length = %d, want 21", len(body))
	}
	if body[0] != TronMainnetPrefix {
		t.Fatalf("prefix = 0x%02x, want 0x41", body[0])
	}

	evmAddr, err := SecretToAddress(FamilyEVM, priv)
	if err != nil {
		t.Fatalf("SecretToAddress(EVM): %v", err)
	}
	wantInner, err := hex.DecodeString(strings.TrimPrefix(evmAddr, "0x"))
	if err != nil {
		t.Fatalf("decode evm addr: %v", err)
	}
	if !bytes.Equal(body[1:], wantInner) {
		t.Fatalf("inner address bytes mismatch:\n  got:  %x\n  want: %x", body[1:], wantInner)
	}
}

func TestDecodeTronAddressBadChecksum(t *testing.T) {
	priv, _ := hex.DecodeString("0000000000000000000000000000000000000000000000000000000000000001")
	addr, _ := SecretToAddress(FamilyTron, priv)
	mid := len(addr) / 2
	bad := addr[:mid] + flip(addr[mid:mid+1]) + addr[mid+1:]
	if bad == addr {
		t.Fatalf("flip produced no change; pick a different position")
	}
	if _, err := DecodeTronAddress(bad); err == nil {
		t.Fatalf("expected checksum error, got nil")
	}
}

func flip(s string) string {
	const alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"
	if s == "" {
		return s
	}
	c := s[0]
	for i := 0; i < len(alphabet); i++ {
		if alphabet[i] == c {
			return string(alphabet[(i+1)%len(alphabet)])
		}
	}
	return s
}

func TestEVMVectorKEqualsOne(t *testing.T) {
	priv, _ := hex.DecodeString("0000000000000000000000000000000000000000000000000000000000000001")
	k, _ := crypto.ToECDSA(priv)
	const want = "0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf"
	if got := crypto.PubkeyToAddress(k.PublicKey).Hex(); got != want {
		t.Fatalf("EVM k=1 address = %s, want %s", got, want)
	}
}
