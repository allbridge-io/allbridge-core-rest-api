package broadcast

import (
	"context"
	"errors"
	"fmt"
	"time"

	solanarpc "github.com/gagliardetto/solana-go/rpc"

	"github.com/allbridge-io/rest-api/cli/internal/sign"
	"github.com/allbridge-io/rest-api/cli/internal/wallet"
)

type solanaBroadcaster struct{}

func (b *solanaBroadcaster) Broadcast(ctx context.Context, signed *sign.Result, opts Options) (*Receipt, error) {
	if opts.RPCURL == "" {
		return nil, errors.New("broadcast/SOLANA: rpc url is required")
	}
	if signed.SignedTx == "" {
		return nil, errors.New("broadcast/SOLANA: signed transaction is empty")
	}
	sig, err := solanarpc.New(opts.RPCURL).SendEncodedTransaction(ctx, signed.SignedTx)
	if err != nil {
		return nil, fmt.Errorf("broadcast/SOLANA: send transaction: %w", err)
	}
	return &Receipt{
		Family: wallet.FamilySolana,
		Hash:   sig.String(),
	}, nil
}

func (b *solanaBroadcaster) WaitForReceipt(_ context.Context, _ string, _ Options, _ time.Duration) error {
	return ErrNotImplemented
}
