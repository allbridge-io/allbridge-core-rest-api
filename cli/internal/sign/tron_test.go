package sign

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"strings"
	"testing"

	"github.com/ethereum/go-ethereum/crypto"

	"github.com/allbridge-io/rest-api/cli/internal/wallet"
)

func TestTronSignerRoundTrip(t *testing.T) {
	priv, err := hex.DecodeString("0000000000000000000000000000000000000000000000000000000000000001")
	if err != nil {
		t.Fatalf("hex: %v", err)
	}

	rawDataHex := "0a02000122080000000000000000"
	rawBytes, _ := hex.DecodeString(rawDataHex)
	expectedTxID := sha256.Sum256(rawBytes)

	tx := map[string]any{
		"visible":      false,
		"txID":         hex.EncodeToString(expectedTxID[:]),
		"raw_data":     map[string]any{"contract": []any{}},
		"raw_data_hex": rawDataHex,
	}
	unsigned, err := json.Marshal(tx)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}

	signer := &tronSigner{}
	res, err := signer.Sign(context.Background(), priv, unsigned, SignOptions{ChainSymbol: "TRX"})
	if err != nil {
		t.Fatalf("Sign: %v", err)
	}
	if res.Family != wallet.FamilyTron {
		t.Fatalf("Family = %q, want TRX", res.Family)
	}
	if !strings.EqualFold(res.Hash, "0x"+hex.EncodeToString(expectedTxID[:])) {
		t.Fatalf("Hash = %q, want 0x%s", res.Hash, hex.EncodeToString(expectedTxID[:]))
	}

	sigBytes, err := hex.DecodeString(res.SignedTx)
	if err != nil {
		t.Fatalf("decode signature: %v", err)
	}
	if len(sigBytes) != 65 {
		t.Fatalf("signature length = %d, want 65", len(sigBytes))
	}

	recovered, err := crypto.Ecrecover(expectedTxID[:], sigBytes)
	if err != nil {
		t.Fatalf("Ecrecover: %v", err)
	}
	expectedPriv, _ := crypto.ToECDSA(priv)
	expectedPub := crypto.FromECDSAPub(&expectedPriv.PublicKey)
	if !equalBytes(recovered, expectedPub) {
		t.Fatalf("recovered pubkey does not match wallet pubkey")
	}

	var signedMap map[string]any
	if err := json.Unmarshal(res.SignedTxJSON, &signedMap); err != nil {
		t.Fatalf("unmarshal signed: %v", err)
	}
	sigList, ok := signedMap["signature"].([]any)
	if !ok || len(sigList) != 1 {
		t.Fatalf("signed JSON missing signature array: %v", signedMap)
	}
}

func TestTronSignerRejectsTxIDMismatch(t *testing.T) {
	priv, _ := hex.DecodeString("0000000000000000000000000000000000000000000000000000000000000001")
	tx := map[string]any{
		"visible":      false,
		"txID":         "deadbeef" + strings.Repeat("00", 28), // wrong on purpose
		"raw_data":     map[string]any{},
		"raw_data_hex": "0a02000122080000000000000000",
	}
	unsigned, _ := json.Marshal(tx)

	if _, err := (&tronSigner{}).Sign(context.Background(), priv, unsigned, SignOptions{}); err == nil {
		t.Fatalf("expected txID mismatch error, got nil")
	}
}

func equalBytes(a, b []byte) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
}
