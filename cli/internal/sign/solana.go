package sign

import (
	"context"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"strings"

	solanago "github.com/gagliardetto/solana-go"

	"github.com/allbridge-io/rest-api/cli/internal/wallet"
)

type solanaSigner struct{}

func (s *solanaSigner) Sign(_ context.Context, secret []byte, unsignedTx json.RawMessage, opts SignOptions) (*Result, error) {
	priv := solanago.PrivateKey(secret)
	if err := priv.Validate(); err != nil {
		return nil, fmt.Errorf("sign/SOLANA: invalid private key: %w", err)
	}
	pub := priv.PublicKey()

	rawHex, err := decodeSolanaRawHex(unsignedTx)
	if err != nil {
		return nil, err
	}
	txBytes, err := hex.DecodeString(rawHex)
	if err != nil {
		return nil, fmt.Errorf("sign/SOLANA: decode raw tx hex: %w", err)
	}
	tx, err := solanago.TransactionFromBytes(txBytes)
	if err != nil {
		return nil, fmt.Errorf("sign/SOLANA: decode transaction: %w", err)
	}
	if _, err := tx.Sign(func(key solanago.PublicKey) *solanago.PrivateKey {
		if key.Equals(pub) {
			return &priv
		}
		return nil
	}); err != nil {
		return nil, fmt.Errorf("sign/SOLANA: sign transaction: %w", err)
	}
	signed, err := tx.ToBase64()
	if err != nil {
		return nil, fmt.Errorf("sign/SOLANA: encode signed transaction: %w", err)
	}
	hash := ""
	if len(tx.Signatures) > 0 {
		hash = tx.Signatures[0].String()
	}
	return &Result{
		Family:      wallet.FamilySolana,
		ChainSymbol: opts.ChainSymbol,
		Hash:        hash,
		SignedTx:    signed,
	}, nil
}

func decodeSolanaRawHex(raw json.RawMessage) (string, error) {
	var s string
	if err := json.Unmarshal(raw, &s); err == nil {
		s = strings.TrimSpace(s)
		if s == "" {
			return "", fmt.Errorf("sign/SOLANA: empty raw transaction")
		}
		return strings.TrimPrefix(s, "0x"), nil
	}
	return "", fmt.Errorf("sign/SOLANA: expected hex-encoded serialized transaction string")
}
