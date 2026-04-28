package sign

import (
	"context"
	"encoding/hex"
	"encoding/json"
	"math/big"
	"strings"
	"testing"

	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/core/types"
	"github.com/ethereum/go-ethereum/crypto"
)

func TestEVMSignerSignsLegacyTransaction(t *testing.T) {
	privateKeyHex := "4c0883a69102937d6231471b5dbb6204fe512961708279df7477e14674fd7f5f"
	secret, err := hex.DecodeString(privateKeyHex)
	if err != nil {
		t.Fatalf("decode private key: %v", err)
	}
	key, err := crypto.ToECDSA(secret)
	if err != nil {
		t.Fatalf("private key: %v", err)
	}
	from := crypto.PubkeyToAddress(key.PublicKey)

	unsigned := map[string]string{
		"from":     from.Hex(),
		"to":       "0x000000000000000000000000000000000000dEaD",
		"value":    "1",
		"data":     "0x",
		"gas":      "21000",
		"gasPrice": "1000000000",
		"nonce":    "7",
		"chainId":  "1",
	}
	raw, err := json.Marshal(unsigned)
	if err != nil {
		t.Fatalf("marshal tx: %v", err)
	}

	result, err := (&evmSigner{}).Sign(context.TODO(), secret, raw, SignOptions{ChainSymbol: "ETH"})
	if err != nil {
		t.Fatalf("Sign returned error: %v", err)
	}
	if result.ChainID != 1 {
		t.Fatalf("ChainID = %d, want 1", result.ChainID)
	}
	if result.Hash == "" || result.SignedTx == "" {
		t.Fatal("signed result missing hash or signed tx")
	}

	encoded, err := hex.DecodeString(strings.TrimPrefix(result.SignedTx, "0x"))
	if err != nil {
		t.Fatalf("decode signed tx: %v", err)
	}
	tx := new(types.Transaction)
	if err := tx.UnmarshalBinary(encoded); err != nil {
		t.Fatalf("unmarshal signed tx: %v", err)
	}
	sender, err := types.Sender(types.NewEIP155Signer(big.NewInt(1)), tx)
	if err != nil {
		t.Fatalf("recover sender: %v", err)
	}
	if sender != from {
		t.Fatalf("sender = %s, want %s", sender.Hex(), from.Hex())
	}
	if tx.To() == nil || *tx.To() != common.HexToAddress(unsigned["to"]) {
		t.Fatalf("to = %v, want %s", tx.To(), unsigned["to"])
	}
}

func TestEVMSignerRejectsWrongFrom(t *testing.T) {
	secret, err := hex.DecodeString("4c0883a69102937d6231471b5dbb6204fe512961708279df7477e14674fd7f5f")
	if err != nil {
		t.Fatalf("decode private key: %v", err)
	}
	raw := json.RawMessage(`{
		"from":"0x0000000000000000000000000000000000000001",
		"to":"0x000000000000000000000000000000000000dEaD",
		"value":"0",
		"data":"0x",
		"gas":"21000",
		"gasPrice":"1000000000",
		"nonce":"0",
		"chainId":"1"
	}`)

	if _, err := (&evmSigner{}).Sign(context.TODO(), secret, raw, SignOptions{}); err == nil {
		t.Fatal("Sign with mismatched from returned nil error")
	}
}
