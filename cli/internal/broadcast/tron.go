package broadcast

import (
	"bytes"
	"context"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/allbridge-io/rest-api/cli/internal/sign"
	"github.com/allbridge-io/rest-api/cli/internal/wallet"
)

type tronBroadcaster struct{}

func (t *tronBroadcaster) Broadcast(ctx context.Context, signed *sign.Result, opts Options) (*Receipt, error) {
	if opts.RPCURL == "" {
		return nil, errors.New("broadcast/TRX: RPC URL required (set rpc.TRX in config or pass --rpc, e.g. https://api.trongrid.io)")
	}
	if len(signed.SignedTxJSON) == 0 {
		return nil, errors.New("broadcast/TRX: signed.SignedTxJSON is empty; rebuild via `allbridge tx build bridge` and re-sign")
	}

	url := strings.TrimRight(opts.RPCURL, "/") + "/wallet/broadcasttransaction"
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(signed.SignedTxJSON))
	if err != nil {
		return nil, fmt.Errorf("broadcast/TRX: build request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("broadcast/TRX: %w", err)
	}
	defer func() { _ = resp.Body.Close() }()
	body, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20))

	var ok struct {
		Result  bool   `json:"result"`
		TxID    string `json:"txid"`
		Code    string `json:"code"`
		Message string `json:"message"`
	}
	if err := json.Unmarshal(body, &ok); err != nil {
		return nil, fmt.Errorf("broadcast/TRX: decode response: %w (body: %s)", err, truncateBody(body))
	}
	if !ok.Result {
		msg := ok.Message
		if dec, derr := hex.DecodeString(msg); derr == nil {
			msg = string(dec)
		}
		if msg == "" {
			msg = string(body)
		}
		return nil, fmt.Errorf("broadcast/TRX: rejected (code=%s): %s", ok.Code, msg)
	}

	hash := ok.TxID
	if hash == "" {
		hash = strings.TrimPrefix(signed.Hash, "0x")
	}
	return &Receipt{
		Family: wallet.FamilyTron,
		Hash:   "0x" + hash,
	}, nil
}

func (t *tronBroadcaster) WaitForReceipt(ctx context.Context, hash string, opts Options, timeout time.Duration) error {
	if opts.RPCURL == "" {
		return errors.New("broadcast/TRX: RPC URL required to wait for receipt")
	}
	if timeout <= 0 {
		timeout = 2 * time.Minute
	}
	deadline := time.Now().Add(timeout)
	url := strings.TrimRight(opts.RPCURL, "/") + "/wallet/gettransactioninfobyid"

	body := []byte(`{"value":"` + strings.TrimPrefix(hash, "0x") + `"}`)

	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		default:
		}

		req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(body))
		if err != nil {
			return err
		}
		req.Header.Set("Content-Type", "application/json")
		resp, err := http.DefaultClient.Do(req)
		if err == nil {
			defer func() { _ = resp.Body.Close() }()
			raw, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
			var info map[string]any
			_ = json.Unmarshal(raw, &info)
			if id, ok := info["id"].(string); ok && id != "" {
				if rec, ok := info["receipt"].(map[string]any); ok {
					if res, ok := rec["result"].(string); ok && res != "" && res != "SUCCESS" {
						return fmt.Errorf("broadcast/TRX: tx %s reverted: %s", hash, res)
					}
				}
				return nil
			}
		}

		if time.Now().After(deadline) {
			return fmt.Errorf("broadcast/TRX: timed out waiting for receipt of %s after %s", hash, timeout)
		}
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(3 * time.Second):
		}
	}
}

func truncateBody(b []byte) string {
	const max = 256
	if len(b) <= max {
		return string(b)
	}
	return string(b[:max]) + "..."
}
