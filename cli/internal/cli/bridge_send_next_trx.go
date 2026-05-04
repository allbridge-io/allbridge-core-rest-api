package cli

import (
	"bytes"
	"context"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"math/big"
	"net/http"
	"strings"
	"time"

	"github.com/mr-tron/base58"

	"github.com/allbridge-io/rest-api/cli/internal/broadcast"
	"github.com/allbridge-io/rest-api/cli/internal/next"
	"github.com/allbridge-io/rest-api/cli/internal/sign"
	"github.com/allbridge-io/rest-api/cli/internal/wallet"
)

// nextTRXSendParams collects what the Tron NEXT sender needs beyond the
// wallet entry. Mirrors nextEVMSendParams.
type nextTRXSendParams struct {
	tx               *next.Tx
	srcToken         *next.Token
	relayerFee       *next.RelayerFee
	bridgeAmountBase string
	rpcURL           string // TronGrid base (e.g. https://api.trongrid.io)
	doApprove        bool
	approveWait      time.Duration
	feeLimit         int64 // sun, default 100_000_000 (~100 TRX cap)

	passphrase string
	onProgress ProgressFunc
	network    string
}

type nextTRXSendResult struct {
	ApproveTxHash string
	Receipt       *broadcast.Receipt
}

const (
	defaultTRXFeeLimit = int64(100_000_000) // 100 TRX, generous cap; refunds unused
	tronGridTrigger    = "/wallet/triggersmartcontract"
)

func signAndBroadcastNextTRX(ctx context.Context, entry wallet.Entry, p nextTRXSendParams) (*nextTRXSendResult, error) {
	if p.tx == nil || p.tx.ContractAddress == "" {
		return nil, chainErr("NEXT returned an empty TRX contract address")
	}
	if p.tx.Tx == "" {
		return nil, chainErr("NEXT returned empty TRX call data")
	}
	feeLimit := p.feeLimit
	if feeLimit == 0 {
		feeLimit = defaultTRXFeeLimit
	}

	passphrase := p.passphrase
	if passphrase == "" {
		var perr error
		passphrase, perr = promptPassphrase(entry.Name)
		if perr != nil {
			return nil, walletErr(perr.Error())
		}
	}
	secret, err := wallet.Decrypt(entry, passphrase)
	if err != nil {
		return nil, walletErr(err.Error())
	}
	defer zero(secret)

	signer, err := sign.For(wallet.FamilyTron)
	if err != nil {
		return nil, chainErr(err.Error())
	}
	caster, err := broadcast.For(wallet.FamilyTron)
	if err != nil {
		return nil, chainErr(err.Error())
	}

	out := &nextTRXSendResult{}

	// Approve step. Same pattern as EVM but the call data still uses the
	// standard ERC-20 approve(address,uint256) selector — TRC-20 is
	// ABI-compatible at the function-selector level. Tron addresses in
	// the spender slot are stripped of their 0x41 prefix and left-padded
	// to 32 bytes (i.e. only the 20-byte EVM-style payload goes in).
	if p.doApprove && p.relayerFee != nil && p.relayerFee.ApprovalSpender != "" && p.srcToken != nil {
		p.onProgress.emit(Progress{Phase: PhaseApprove, Status: PhaseRunning})
		hash, err := runNextTRXApprove(ctx, signer, caster, secret,
			entry.Address, p.srcToken.Address, p.relayerFee.ApprovalSpender,
			p.bridgeAmountBase, p.rpcURL, feeLimit, p.approveWait)
		if err != nil {
			p.onProgress.emit(Progress{Phase: PhaseApprove, Status: PhaseFailed, Err: err})
			return nil, err
		}
		out.ApproveTxHash = hash
		p.onProgress.emit(Progress{
			Phase: PhaseApprove, Status: PhaseDone,
			Hash: hash, ExplorerURL: txExplorerURL(p.srcToken.Chain, hash, p.network),
		})
	} else {
		p.onProgress.emit(Progress{Phase: PhaseApprove, Status: PhaseSkipped})
	}

	p.onProgress.emit(Progress{Phase: PhaseBuild, Status: PhaseRunning, Note: "TronGrid triggersmartcontract"})
	envelope, err := buildNextTRXTx(ctx, p.rpcURL, entry.Address,
		p.tx.ContractAddress, p.tx.Value, p.tx.Tx, feeLimit)
	if err != nil {
		p.onProgress.emit(Progress{Phase: PhaseBuild, Status: PhaseFailed, Err: err})
		return nil, chainErrf("build bridge tx: %v", err)
	}
	p.onProgress.emit(Progress{Phase: PhaseBuild, Status: PhaseDone})

	p.onProgress.emit(Progress{Phase: PhaseSign, Status: PhaseRunning})
	res, err := signer.Sign(ctx, secret, envelope, sign.SignOptions{ChainSymbol: "TRX"})
	if err != nil {
		p.onProgress.emit(Progress{Phase: PhaseSign, Status: PhaseFailed, Err: err})
		return nil, chainErrf("sign bridge tx: %v", err)
	}
	p.onProgress.emit(Progress{Phase: PhaseSign, Status: PhaseDone})

	p.onProgress.emit(Progress{Phase: PhaseBroadcast, Status: PhaseRunning, Note: p.rpcURL})
	r, err := caster.Broadcast(ctx, res, broadcast.Options{RPCURL: p.rpcURL})
	if err != nil {
		p.onProgress.emit(Progress{Phase: PhaseBroadcast, Status: PhaseFailed, Err: err})
		return nil, chainErrf("broadcast bridge tx: %v", err)
	}
	out.Receipt = r
	return out, nil
}

func runNextTRXApprove(
	ctx context.Context,
	signer sign.Signer, caster broadcast.Broadcaster, secret []byte,
	owner, tokenAddr, spender, amountBase, rpcURL string,
	feeLimit int64, _ time.Duration,
) (string, error) {
	want, ok := new(big.Int).SetString(amountBase, 10)
	if !ok {
		return "", chainErrf("parse bridge amount %q for approve", amountBase)
	}

	// We don't pre-check allowance on Tron — the existing Core path skips
	// it too on TRX, and `triggersmartcontract` against trongrid for an
	// allowance read would double the network round-trips. Approve is
	// idempotent enough; users can set a long-lived high allowance once
	// and stop passing --approve thereafter.
	spenderHex, err := tronAddrToEVMHex(spender)
	if err != nil {
		return "", chainErrf("decode approve spender %q: %v", spender, err)
	}
	data := buildERC20ApproveCallDataHex(spenderHex, want)

	envelope, err := buildNextTRXTx(ctx, rpcURL, owner, tokenAddr, "0", data, feeLimit)
	if err != nil {
		return "", chainErrf("build approve tx: %v", err)
	}
	res, err := signer.Sign(ctx, secret, envelope, sign.SignOptions{ChainSymbol: "TRX"})
	if err != nil {
		return "", chainErrf("sign approve tx: %v", err)
	}
	r, err := caster.Broadcast(ctx, res, broadcast.Options{RPCURL: rpcURL})
	if err != nil {
		return "", chainErrf("broadcast approve tx: %v", err)
	}
	// Tron lacks a synchronous "wait for receipt" that's both quick and
	// reliable on TronGrid; rely on the broadcast response (already
	// validated by the broadcaster). The bridge tx will fail loud if the
	// allowance hasn't propagated by then.
	return r.Hash, nil
}

// buildNextTRXTx posts to TronGrid's triggersmartcontract endpoint with
// the raw call data NEXT returned and pulls back the unsigned tx envelope
// that the existing tronSigner already understands (raw_data,
// raw_data_hex, txID, ...).
//
// `value` here is in SUN (1e-6 TRX), matching NEXT's EVM convention of
// returning the chain's native lowest unit.
func buildNextTRXTx(ctx context.Context, rpcURL, owner, contract, value, dataHex string, feeLimit int64) (json.RawMessage, error) {
	callValue := int64(0)
	if v := strings.TrimSpace(value); v != "" {
		if n, ok := new(big.Int).SetString(strings.TrimPrefix(v, "0x"), 0); ok {
			if n.IsInt64() {
				callValue = n.Int64()
			}
		}
	}

	body := map[string]any{
		"owner_address":    owner,
		"contract_address": contract,
		"data":             strings.TrimPrefix(dataHex, "0x"),
		"call_value":       callValue,
		"fee_limit":        feeLimit,
		"visible":          true, // keep base58 addresses round-tripping
	}
	bodyBytes, err := json.Marshal(body)
	if err != nil {
		return nil, fmt.Errorf("marshal triggersmartcontract body: %w", err)
	}

	url := strings.TrimRight(rpcURL, "/") + tronGridTrigger
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(bodyBytes))
	if err != nil {
		return nil, fmt.Errorf("build triggersmartcontract request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("triggersmartcontract: %w", err)
	}
	defer func() { _ = resp.Body.Close() }()
	raw, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20))

	var parsed struct {
		Transaction json.RawMessage `json:"transaction"`
		Result      struct {
			Code    string `json:"code"`
			Message string `json:"message"`
		} `json:"result"`
	}
	if err := json.Unmarshal(raw, &parsed); err != nil {
		return nil, fmt.Errorf("decode triggersmartcontract response: %w (body: %s)", err, truncate512(raw))
	}
	if parsed.Result.Code != "" {
		msg := parsed.Result.Message
		if dec, derr := hex.DecodeString(msg); derr == nil && len(dec) > 0 {
			msg = string(dec)
		}
		return nil, fmt.Errorf("triggersmartcontract rejected (code=%s): %s", parsed.Result.Code, msg)
	}
	if len(parsed.Transaction) == 0 {
		return nil, fmt.Errorf("triggersmartcontract returned no transaction (body: %s)", truncate512(raw))
	}
	return parsed.Transaction, nil
}

// tronAddrToEVMHex decodes a Tron base58check address (T...) into the
// 20-byte EVM-style representation used inside ABI-encoded function
// arguments. Hex inputs (with optional 0x or 41 prefix) pass through.
func tronAddrToEVMHex(addr string) (string, error) {
	addr = strings.TrimSpace(addr)
	if addr == "" {
		return "", fmt.Errorf("empty address")
	}
	// Hex inputs: accept 0x..., 41..., or bare 40-char.
	if strings.HasPrefix(addr, "0x") || strings.HasPrefix(addr, "0X") {
		h := strings.TrimPrefix(strings.TrimPrefix(addr, "0x"), "0X")
		if len(h) == 42 && strings.HasPrefix(strings.ToLower(h), "41") {
			h = h[2:]
		}
		if len(h) != 40 {
			return "", fmt.Errorf("hex address must be 20 bytes, got %d hex chars", len(h))
		}
		return h, nil
	}
	if len(addr) == 42 && strings.HasPrefix(strings.ToLower(addr), "41") {
		return addr[2:], nil
	}
	dec, err := base58.Decode(addr)
	if err != nil {
		return "", fmt.Errorf("base58 decode: %w", err)
	}
	if len(dec) != 25 {
		return "", fmt.Errorf("base58check Tron address must be 25 bytes, got %d", len(dec))
	}
	if dec[0] != 0x41 {
		return "", fmt.Errorf("Tron address version byte must be 0x41, got 0x%02x", dec[0])
	}
	return hex.EncodeToString(dec[1:21]), nil
}

// buildERC20ApproveCallDataHex returns the hex-encoded call data for
// `approve(address,uint256)` given a 20-byte spender hex (no 0x).
func buildERC20ApproveCallDataHex(spender20Hex string, amount *big.Int) string {
	spenderBytes, _ := hex.DecodeString(spender20Hex)
	out := make([]byte, 0, 4+32+32)
	sel, _ := hex.DecodeString("095ea7b3")
	out = append(out, sel...)
	out = append(out, leftPad32(spenderBytes)...)
	out = append(out, leftPad32(amount.Bytes())...)
	return hex.EncodeToString(out)
}

func leftPad32(b []byte) []byte {
	if len(b) >= 32 {
		return b[len(b)-32:]
	}
	out := make([]byte, 32)
	copy(out[32-len(b):], b)
	return out
}

func truncate512(b []byte) string {
	const max = 512
	if len(b) <= max {
		return string(b)
	}
	return string(b[:max]) + "..."
}
