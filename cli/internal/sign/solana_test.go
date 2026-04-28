package sign

import (
	"context"
	"encoding/hex"
	"encoding/json"
	"testing"

	solanago "github.com/gagliardetto/solana-go"
	"github.com/gagliardetto/solana-go/programs/system"
)

func TestSolanaSignerSignsHexSerializedTransaction(t *testing.T) {
	priv, err := solanago.NewRandomPrivateKey()
	if err != nil {
		t.Fatalf("NewRandomPrivateKey returned error: %v", err)
	}
	recipient, err := solanago.NewRandomPrivateKey()
	if err != nil {
		t.Fatalf("NewRandomPrivateKey recipient returned error: %v", err)
	}
	blockhash, err := solanago.HashFromBase58("A9QnpgfhCkmiBSjgBuWk76Wo3HxzxvDopUq9x6UUMmjn")
	if err != nil {
		t.Fatalf("HashFromBase58 returned error: %v", err)
	}
	tx, err := solanago.NewTransaction(
		[]solanago.Instruction{
			system.NewTransferInstruction(1, priv.PublicKey(), recipient.PublicKey()).Build(),
		},
		blockhash,
	)
	if err != nil {
		t.Fatalf("NewTransaction returned error: %v", err)
	}
	unsigned, err := tx.MarshalBinary()
	if err != nil {
		t.Fatalf("MarshalBinary returned error: %v", err)
	}
	raw, err := json.Marshal(hex.EncodeToString(unsigned))
	if err != nil {
		t.Fatalf("Marshal raw returned error: %v", err)
	}

	res, err := (&solanaSigner{}).Sign(context.Background(), priv, raw, SignOptions{ChainSymbol: "SOL"})
	if err != nil {
		t.Fatalf("Sign returned error: %v", err)
	}
	if res.SignedTx == "" {
		t.Fatal("SignedTx is empty")
	}
	signed, err := solanago.TransactionFromBase64(res.SignedTx)
	if err != nil {
		t.Fatalf("TransactionFromBase64 returned error: %v", err)
	}
	if err := signed.VerifySignatures(); err != nil {
		t.Fatalf("VerifySignatures returned error: %v", err)
	}
	if res.Hash != signed.Signatures[0].String() {
		t.Fatalf("Hash = %q, want first signature %q", res.Hash, signed.Signatures[0].String())
	}
}
