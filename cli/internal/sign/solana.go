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
	rawHex, err := decodeSolanaRawHex(unsignedTx)
	if err != nil {
		return nil, err
	}
	txBytes, err := hex.DecodeString(rawHex)
	if err != nil {
		return nil, fmt.Errorf("sign/SOLANA: decode raw tx hex: %w", err)
	}
	return SignSolanaTxBytes(secret, txBytes, opts.ChainSymbol)
}

// SignSolanaTxBytes signs an already-deserialised Solana transaction
// (legacy or versioned — gagliardetto/solana-go's TransactionFromBytes
// auto-detects the format via the version marker byte).
//
// Both Core's `/raw/bridge` (hex-encoded) and NEXT's `/tx/create`
// (base64-encoded VersionedTransaction) ultimately reduce to "I have raw
// transaction bytes, sign them" — this is the shared core, exported so
// the NEXT send path can call it after base64-decoding without going
// through the json.RawMessage detour the Signer interface requires.
//
// Implementation note: we *partial-sign* — write the user's signature
// only into signer slots whose pubkey matches the user, leaving any
// pre-existing slots untouched. NEXT's CCTP V2 flow returns a tx with
// two required signers: the user (slot 0) and an ephemeral
// MessageSentEventData account (slot 1, pre-signed server-side). The
// vendored solana-go's `tx.Sign()` is too strict — it errors out on the
// first signer slot whose key isn't in the callback — so we drive the
// signature write loop ourselves.
func SignSolanaTxBytes(secret, txBytes []byte, chainSymbol string) (*Result, error) {
	priv := solanago.PrivateKey(secret)
	if err := priv.Validate(); err != nil {
		return nil, fmt.Errorf("sign/SOLANA: invalid private key: %w", err)
	}
	pub := priv.PublicKey()

	tx, err := solanago.TransactionFromBytes(txBytes)
	if err != nil {
		return nil, fmt.Errorf("sign/SOLANA: decode transaction: %w", err)
	}

	msgBytes, err := tx.Message.MarshalBinary()
	if err != nil {
		return nil, fmt.Errorf("sign/SOLANA: marshal message: %w", err)
	}

	numSigners := int(tx.Message.Header.NumRequiredSignatures)
	if numSigners > len(tx.Message.AccountKeys) {
		return nil, fmt.Errorf("sign/SOLANA: malformed message header (%d signers > %d account keys)", numSigners, len(tx.Message.AccountKeys))
	}
	// Pad signatures slice to numSigners with empty entries so we can
	// index into it safely. Pre-existing entries (server-side signatures)
	// stay intact; we only overwrite slots whose pubkey matches the user.
	for len(tx.Signatures) < numSigners {
		tx.Signatures = append(tx.Signatures, solanago.Signature{})
	}

	signed := false
	for i := 0; i < numSigners; i++ {
		if !tx.Message.AccountKeys[i].Equals(pub) {
			continue
		}
		sig, err := priv.Sign(msgBytes)
		if err != nil {
			return nil, fmt.Errorf("sign/SOLANA: sign: %w", err)
		}
		tx.Signatures[i] = sig
		signed = true
	}
	if !signed {
		return nil, fmt.Errorf("sign/SOLANA: user key %s not found in tx required signers", pub)
	}

	signedB64, err := tx.ToBase64()
	if err != nil {
		return nil, fmt.Errorf("sign/SOLANA: encode signed transaction: %w", err)
	}
	hash := ""
	if len(tx.Signatures) > 0 {
		hash = tx.Signatures[0].String()
	}
	return &Result{
		Family:      wallet.FamilySolana,
		ChainSymbol: chainSymbol,
		Hash:        hash,
		SignedTx:    signedB64,
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
