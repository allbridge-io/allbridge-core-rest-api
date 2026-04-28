package broadcast

import (
	"context"
	"encoding/hex"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/core/types"
	"github.com/ethereum/go-ethereum/ethclient"

	"github.com/allbridge-io/rest-api/cli/internal/sign"
	"github.com/allbridge-io/rest-api/cli/internal/wallet"
)

type evmBroadcaster struct{}

func (e *evmBroadcaster) Broadcast(ctx context.Context, signed *sign.Result, opts Options) (*Receipt, error) {
	if opts.RPCURL == "" {
		return nil, errors.New("broadcast/EVM: RPC URL required (set rpc.<chain> in config or pass --rpc)")
	}
	cli, err := ethclient.DialContext(ctx, opts.RPCURL)
	if err != nil {
		return nil, fmt.Errorf("broadcast/EVM: dial %s: %w", opts.RPCURL, err)
	}
	defer cli.Close()

	raw := strings.TrimPrefix(signed.SignedTx, "0x")
	enc, err := hex.DecodeString(raw)
	if err != nil {
		return nil, fmt.Errorf("broadcast/EVM: bad signed tx hex: %w", err)
	}
	tx := new(types.Transaction)
	if err := tx.UnmarshalBinary(enc); err != nil {
		return nil, fmt.Errorf("broadcast/EVM: decode signed tx: %w", err)
	}
	if err := cli.SendTransaction(ctx, tx); err != nil {
		return nil, fmt.Errorf("broadcast/EVM: send: %w", err)
	}
	return &Receipt{
		Family: wallet.FamilyEVM,
		Hash:   tx.Hash().Hex(),
	}, nil
}

func (e *evmBroadcaster) WaitForReceipt(ctx context.Context, hash string, opts Options, timeout time.Duration) error {
	if opts.RPCURL == "" {
		return errors.New("broadcast/EVM: RPC URL required to wait for receipt")
	}
	cli, err := ethclient.DialContext(ctx, opts.RPCURL)
	if err != nil {
		return fmt.Errorf("broadcast/EVM: dial: %w", err)
	}
	defer cli.Close()

	if timeout <= 0 {
		timeout = 2 * time.Minute
	}
	deadline := time.Now().Add(timeout)
	h := common.HexToHash(hash)

	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		default:
		}
		rcpt, err := cli.TransactionReceipt(ctx, h)
		if err == nil && rcpt != nil {
			if rcpt.Status == 1 {
				return nil
			}
			return fmt.Errorf("broadcast/EVM: tx %s reverted (status=%d)", hash, rcpt.Status)
		}
		if time.Now().After(deadline) {
			return fmt.Errorf("broadcast/EVM: timed out waiting for receipt of %s after %s", hash, timeout)
		}
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(2 * time.Second):
		}
	}
}
