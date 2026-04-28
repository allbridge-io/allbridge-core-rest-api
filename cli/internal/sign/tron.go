package sign

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"strings"

	"github.com/ethereum/go-ethereum/crypto"

	"github.com/allbridge-io/rest-api/cli/internal/wallet"
)

type tronTx struct {
	Visible    bool            `json:"visible"`
	TxID       string          `json:"txID"`
	RawData    json.RawMessage `json:"raw_data"`
	RawDataHex string          `json:"raw_data_hex"`
	Signature  []string        `json:"signature,omitempty"`
}

type tronSigner struct{}

func (t *tronSigner) Sign(_ context.Context, secret []byte, unsigned json.RawMessage, opts SignOptions) (*Result, error) {
	var asMap map[string]json.RawMessage
	if err := json.Unmarshal(unsigned, &asMap); err != nil {
		return nil, fmt.Errorf("sign/TRX: parse tx: %w", err)
	}
	var tx tronTx
	if err := json.Unmarshal(unsigned, &tx); err != nil {
		return nil, fmt.Errorf("sign/TRX: parse tx fields: %w", err)
	}
	if tx.RawDataHex == "" {
		return nil, errors.New("sign/TRX: tx.raw_data_hex is empty")
	}

	rawData, err := hex.DecodeString(strings.TrimPrefix(tx.RawDataHex, "0x"))
	if err != nil {
		return nil, fmt.Errorf("sign/TRX: bad raw_data_hex: %w", err)
	}

	computedHash := sha256.Sum256(rawData)
	computed := hex.EncodeToString(computedHash[:])
	if tx.TxID != "" && !strings.EqualFold(tx.TxID, computed) {
		return nil, fmt.Errorf("sign/TRX: txID mismatch (server=%s computed=%s)", tx.TxID, computed)
	}

	priv, err := crypto.ToECDSA(secret)
	if err != nil {
		return nil, fmt.Errorf("sign/TRX: bad private key: %w", err)
	}

	sig, err := crypto.Sign(computedHash[:], priv)
	if err != nil {
		return nil, fmt.Errorf("sign/TRX: %w", err)
	}
	hexSig := hex.EncodeToString(sig)

	sigJSON, err := json.Marshal([]string{hexSig})
	if err != nil {
		return nil, err
	}
	asMap["signature"] = sigJSON
	signedJSON, err := json.Marshal(asMap)
	if err != nil {
		return nil, err
	}

	return &Result{
		Family:       wallet.FamilyTron,
		ChainSymbol:  opts.ChainSymbol,
		Hash:         "0x" + computed,
		SignedTx:     hexSig, // for symmetry with EVM (just the sig, hex)
		SignedTxJSON: signedJSON,
	}, nil
}
