package sign

import (
	"context"
	"encoding/json"
	"errors"

	"github.com/allbridge-io/rest-api/cli/internal/wallet"
)

var ErrNotImplemented = errors.New("sign: not implemented for this chain family")

type Result struct {
	Family       wallet.Family   `json:"family"`
	ChainSymbol  string          `json:"chainSymbol,omitempty"`
	ChainID      int64           `json:"chainId,omitempty"`
	Hash         string          `json:"hash,omitempty"`         // tx hash if known pre-broadcast
	SignedTx     string          `json:"signedTx,omitempty"`     // hex / base64 / json string per family
	SignedTxJSON json.RawMessage `json:"signedTxJSON,omitempty"` // original tx augmented with signature(s)
}

type Signer interface {
	Sign(ctx context.Context, secret []byte, unsignedTx json.RawMessage, opts SignOptions) (*Result, error)
}

type SignOptions struct {
	ChainID     int64   // EVM
	ChainSymbol string  // for diagnostic messages
	GasPriceWei string  // EVM, optional override
	GasLimit    uint64  // EVM, optional override
	NonceOver   *uint64 // EVM, optional override
}

func For(f wallet.Family) (Signer, error) {
	switch f {
	case wallet.FamilyEVM:
		return &evmSigner{}, nil
	case wallet.FamilySolana:
		return &solanaSigner{}, nil
	case wallet.FamilyTron:
		return &tronSigner{}, nil
	case wallet.FamilySoroban:
		return &stub{family: f}, nil
	case wallet.FamilyStellar:
		return &stub{family: f}, nil
	case wallet.FamilyAlgorand:
		return &stub{family: f}, nil
	case wallet.FamilySui:
		return &stub{family: f}, nil
	case wallet.FamilyStacks:
		return &stub{family: f}, nil
	}
	return nil, errors.New("sign: unknown family")
}

type stub struct{ family wallet.Family }

func (s *stub) Sign(_ context.Context, _ []byte, _ json.RawMessage, _ SignOptions) (*Result, error) {
	return nil, ErrNotImplemented
}
