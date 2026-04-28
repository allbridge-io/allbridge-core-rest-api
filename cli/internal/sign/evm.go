package sign

import (
	"context"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"math/big"
	"strings"

	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/core/types"
	"github.com/ethereum/go-ethereum/crypto"

	"github.com/allbridge-io/rest-api/cli/internal/wallet"
)

type evmTx struct {
	From     string `json:"from"`
	To       string `json:"to"`
	Value    string `json:"value"`
	Data     string `json:"data"`
	Gas      string `json:"gas,omitempty"`
	GasPrice string `json:"gasPrice,omitempty"`
	Nonce    string `json:"nonce,omitempty"`
	ChainID  string `json:"chainId,omitempty"`
}

type evmSigner struct{}

func (e *evmSigner) Sign(_ context.Context, secret []byte, unsigned json.RawMessage, opts SignOptions) (*Result, error) {
	var tx evmTx
	if err := json.Unmarshal(unsigned, &tx); err != nil {
		return nil, fmt.Errorf("sign/EVM: parse tx: %w", err)
	}

	chainID := big.NewInt(opts.ChainID)
	if opts.ChainID == 0 && tx.ChainID != "" {
		chainID, _ = parseBigInt(tx.ChainID)
	}
	if chainID == nil || chainID.Sign() == 0 {
		return nil, errors.New("sign/EVM: chainID is required (pass --chain-id or include it in the tx)")
	}

	value := mustBigInt(tx.Value)
	gas, err := parseUint64(tx.Gas)
	if err != nil {
		return nil, fmt.Errorf("sign/EVM: gas: %w", err)
	}
	if opts.GasLimit > 0 {
		gas = opts.GasLimit
	}
	if gas == 0 {
		gas = 200_000 // sane default; encourage caller to provide it
	}
	gasPrice := mustBigInt(tx.GasPrice)
	if opts.GasPriceWei != "" {
		if v, ok := new(big.Int).SetString(opts.GasPriceWei, 10); ok {
			gasPrice = v
		}
	}
	nonce, err := parseUint64(tx.Nonce)
	if err != nil {
		return nil, fmt.Errorf("sign/EVM: nonce: %w", err)
	}
	if opts.NonceOver != nil {
		nonce = *opts.NonceOver
	}

	to := common.HexToAddress(tx.To)
	data := mustHex(tx.Data)

	priv, err := crypto.ToECDSA(secret)
	if err != nil {
		return nil, fmt.Errorf("sign/EVM: bad private key: %w", err)
	}
	expectedFrom := crypto.PubkeyToAddress(priv.PublicKey).Hex()
	if tx.From != "" && !strings.EqualFold(expectedFrom, tx.From) {
		return nil, fmt.Errorf("sign/EVM: wallet address %s does not match tx.from %s", expectedFrom, tx.From)
	}

	rawTx := types.NewTransaction(nonce, to, value, gas, gasPrice, data)
	signed, err := types.SignTx(rawTx, types.NewEIP155Signer(chainID), priv)
	if err != nil {
		return nil, fmt.Errorf("sign/EVM: %w", err)
	}

	enc, err := signed.MarshalBinary()
	if err != nil {
		return nil, err
	}
	return &Result{
		Family:      wallet.FamilyEVM,
		ChainSymbol: opts.ChainSymbol,
		ChainID:     chainID.Int64(),
		Hash:        signed.Hash().Hex(),
		SignedTx:    "0x" + hex.EncodeToString(enc),
	}, nil
}

func mustBigInt(s string) *big.Int {
	if s == "" {
		return new(big.Int)
	}
	v, _ := parseBigInt(s)
	if v == nil {
		return new(big.Int)
	}
	return v
}

func parseBigInt(s string) (*big.Int, bool) {
	s = strings.TrimSpace(s)
	if strings.HasPrefix(s, "0x") || strings.HasPrefix(s, "0X") {
		v, ok := new(big.Int).SetString(s[2:], 16)
		return v, ok
	}
	v, ok := new(big.Int).SetString(s, 10)
	return v, ok
}

func parseUint64(s string) (uint64, error) {
	if s == "" {
		return 0, nil
	}
	v, ok := parseBigInt(s)
	if !ok {
		return 0, fmt.Errorf("not an integer: %q", s)
	}
	if !v.IsUint64() {
		return 0, fmt.Errorf("does not fit in uint64: %s", s)
	}
	return v.Uint64(), nil
}

func mustHex(s string) []byte {
	s = strings.TrimPrefix(strings.TrimPrefix(s, "0x"), "0X")
	if s == "" {
		return nil
	}
	b, err := hex.DecodeString(s)
	if err != nil {
		return nil
	}
	return b
}
