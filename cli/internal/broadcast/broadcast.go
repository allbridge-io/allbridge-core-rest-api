package broadcast

import (
	"context"
	"errors"
	"time"

	"github.com/allbridge-io/rest-api/cli/internal/sign"
	"github.com/allbridge-io/rest-api/cli/internal/wallet"
)

var ErrNotImplemented = errors.New("broadcast: not implemented for this chain family")

type Receipt struct {
	Family wallet.Family `json:"family"`
	Hash   string        `json:"hash"`
	Raw    any           `json:"raw,omitempty"`
}

type Broadcaster interface {
	Broadcast(ctx context.Context, signed *sign.Result, opts Options) (*Receipt, error)
	WaitForReceipt(ctx context.Context, hash string, opts Options, timeout time.Duration) error
}

type Options struct {
	RPCURL string
}

func For(f wallet.Family) (Broadcaster, error) {
	switch f {
	case wallet.FamilyEVM:
		return &evmBroadcaster{}, nil
	case wallet.FamilySolana:
		return &solanaBroadcaster{}, nil
	case wallet.FamilyTron:
		return &tronBroadcaster{}, nil
	}
	return &stub{}, nil
}

type stub struct{}

func (s *stub) Broadcast(_ context.Context, _ *sign.Result, _ Options) (*Receipt, error) {
	return nil, ErrNotImplemented
}

func (s *stub) WaitForReceipt(_ context.Context, _ string, _ Options, _ time.Duration) error {
	return ErrNotImplemented
}
