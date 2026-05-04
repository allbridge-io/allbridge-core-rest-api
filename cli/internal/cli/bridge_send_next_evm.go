package cli

import (
	"context"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"math/big"
	"strings"
	"time"

	"github.com/ethereum/go-ethereum"
	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/ethclient"

	"github.com/allbridge-io/rest-api/cli/internal/broadcast"
	"github.com/allbridge-io/rest-api/cli/internal/next"
	"github.com/allbridge-io/rest-api/cli/internal/sign"
	"github.com/allbridge-io/rest-api/cli/internal/wallet"
)

// nextEVMSendParams collects the inputs the EVM NEXT sender needs beyond
// the wallet entry. We pass these explicitly rather than threading the
// full nextSendParams through every helper.
type nextEVMSendParams struct {
	tx               *next.Tx
	srcToken         *next.Token      // the token being bridged (for approve target)
	relayerFee       *next.RelayerFee // optional; ApprovalSpender drives the approve flow
	bridgeAmountBase string           // base units, used as approve amount when needed
	rpcURL           string
	doApprove        bool
	approveWait      time.Duration

	passphrase string       // skips promptPassphrase when set (TUI inline input)
	onProgress ProgressFunc // nil disables phase emissions (CLI default)
	network    string       // "mainnet"|"testnet" — used for explorer URL in progress events
}

// nextEVMSendResult is what we return so the caller can render hashes for
// both the approve tx (if any) and the bridge tx.
type nextEVMSendResult struct {
	ApproveTxHash string
	Receipt       *broadcast.Receipt
}

func signAndBroadcastNextEVM(ctx context.Context, entry wallet.Entry, p nextEVMSendParams) (*nextEVMSendResult, error) {
	if p.tx == nil || p.tx.ContractAddress == "" {
		return nil, chainErr("NEXT returned an empty EVM contract address")
	}
	if p.tx.Tx == "" {
		return nil, chainErr("NEXT returned empty EVM call data")
	}

	cli, err := ethclient.DialContext(ctx, p.rpcURL)
	if err != nil {
		return nil, chainErrf("dial EVM RPC %s: %v", p.rpcURL, err)
	}
	defer cli.Close()

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

	signer, err := sign.For(wallet.FamilyEVM)
	if err != nil {
		return nil, chainErr(err.Error())
	}
	caster, err := broadcast.For(wallet.FamilyEVM)
	if err != nil {
		return nil, chainErr(err.Error())
	}

	senderAddr := common.HexToAddress(entry.Address)
	out := &nextEVMSendResult{}

	// Approve step. NEXT (and the web app) drive approval via
	// `relayerFee.approvalSpender` — the contract that needs to spend the
	// SOURCE token (not the relayer-fee token). Skip if allowance is
	// already sufficient or if --approve wasn't requested.
	if p.doApprove && p.relayerFee != nil && p.relayerFee.ApprovalSpender != "" && p.srcToken != nil {
		p.onProgress.emit(Progress{Phase: PhaseAllowance, Status: PhaseRunning})
		hash, err := runNextEVMApprove(ctx, cli, signer, caster, secret, senderAddr,
			common.HexToAddress(p.srcToken.Address),
			common.HexToAddress(p.relayerFee.ApprovalSpender),
			p.bridgeAmountBase, p.rpcURL, p.approveWait, p.srcToken.Chain, p.network, p.onProgress)
		if err != nil {
			return nil, err
		}
		out.ApproveTxHash = hash
	} else {
		p.onProgress.emit(Progress{Phase: PhaseApprove, Status: PhaseSkipped})
	}

	// Bridge tx. Fresh build so the nonce reflects any approve we just
	// broadcast; a reused nonce would silently be rejected.
	p.onProgress.emit(Progress{Phase: PhaseBuild, Status: PhaseRunning, Note: "fetch nonce/gas/chainId"})
	unsigned, err := buildNextEVMTx(ctx, cli, senderAddr, p.tx.ContractAddress, p.tx.Value, p.tx.Tx)
	if err != nil {
		p.onProgress.emit(Progress{Phase: PhaseBuild, Status: PhaseFailed, Err: err})
		return nil, chainErrf("build bridge tx: %v", err)
	}
	p.onProgress.emit(Progress{Phase: PhaseBuild, Status: PhaseDone})

	p.onProgress.emit(Progress{Phase: PhaseSign, Status: PhaseRunning})
	res, err := signer.Sign(ctx, secret, unsigned, sign.SignOptions{})
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

// runNextEVMApprove builds, signs and broadcasts a standard
// `approve(spender, amount)` ERC-20 call against `tokenAddr` if the
// current allowance is below `amountBase`. Returns the approve tx hash
// (empty when no approve was needed).
func runNextEVMApprove(
	ctx context.Context, cli *ethclient.Client,
	signer sign.Signer, caster broadcast.Broadcaster, secret []byte,
	owner, tokenAddr, spender common.Address, amountBase, rpcURL string, wait time.Duration,
	chainSymbol, network string, onProgress ProgressFunc,
) (string, error) {
	want, ok := new(big.Int).SetString(amountBase, 10)
	if !ok {
		return "", chainErrf("parse bridge amount %q for approve", amountBase)
	}
	current, err := evmAllowance(ctx, cli, tokenAddr, owner, spender)
	if err != nil {
		return "", chainErrf("read allowance: %v", err)
	}
	if current.Cmp(want) >= 0 {
		onProgress.emit(Progress{Phase: PhaseAllowance, Status: PhaseDone, Note: "sufficient"})
		onProgress.emit(Progress{Phase: PhaseApprove, Status: PhaseSkipped})
		return "", nil
	}
	onProgress.emit(Progress{Phase: PhaseAllowance, Status: PhaseDone, Note: "insufficient → approving"})

	onProgress.emit(Progress{Phase: PhaseApprove, Status: PhaseRunning})
	data := buildERC20ApproveCallData(spender, want)
	unsigned, err := buildNextEVMTx(ctx, cli, owner, tokenAddr.Hex(), "0", "0x"+hex.EncodeToString(data))
	if err != nil {
		onProgress.emit(Progress{Phase: PhaseApprove, Status: PhaseFailed, Err: err})
		return "", chainErrf("build approve tx: %v", err)
	}
	res, err := signer.Sign(ctx, secret, unsigned, sign.SignOptions{})
	if err != nil {
		onProgress.emit(Progress{Phase: PhaseApprove, Status: PhaseFailed, Err: err})
		return "", chainErrf("sign approve tx: %v", err)
	}
	r, err := caster.Broadcast(ctx, res, broadcast.Options{RPCURL: rpcURL})
	if err != nil {
		onProgress.emit(Progress{Phase: PhaseApprove, Status: PhaseFailed, Err: err})
		return "", chainErrf("broadcast approve tx: %v", err)
	}
	onProgress.emit(Progress{
		Phase: PhaseApprove, Status: PhaseDone,
		Hash: r.Hash, ExplorerURL: txExplorerURL(chainSymbol, r.Hash, network),
	})
	onProgress.emit(Progress{Phase: PhaseApproveWait, Status: PhaseRunning})
	if err := caster.WaitForReceipt(ctx, r.Hash, broadcast.Options{RPCURL: rpcURL}, wait); err != nil {
		onProgress.emit(Progress{Phase: PhaseApproveWait, Status: PhaseFailed, Err: err})
		return "", chainErrf("wait for approve receipt: %v", err)
	}
	onProgress.emit(Progress{Phase: PhaseApproveWait, Status: PhaseDone})
	return r.Hash, nil
}

// buildNextEVMTx fetches chainId/nonce/gas/gasPrice from the RPC and
// emits a JSON payload in the exact shape the existing internal evmSigner
// already understands. We use legacy gasPrice (matches the signer's
// types.NewTransaction path); EIP-1559 maxFee/priority would require
// extending the signer first.
func buildNextEVMTx(ctx context.Context, cli *ethclient.Client, from common.Address, to, value, data string) (json.RawMessage, error) {
	chainID, err := cli.ChainID(ctx)
	if err != nil {
		return nil, fmt.Errorf("eth_chainId: %w", err)
	}
	nonce, err := cli.PendingNonceAt(ctx, from)
	if err != nil {
		return nil, fmt.Errorf("eth_getTransactionCount: %w", err)
	}
	gasPrice, err := cli.SuggestGasPrice(ctx)
	if err != nil {
		return nil, fmt.Errorf("eth_gasPrice: %w", err)
	}
	// Bump 2× to absorb base-fee movement between estimate and broadcast.
	// Arbitrum Sepolia in particular changes base fee every ~250ms; a flat
	// suggestion is often already stale by the time the tx hits a sequencer.
	// Excess gets refunded — this is a safety margin, not a real cost.
	gasPrice = new(big.Int).Mul(gasPrice, big.NewInt(2))

	valueBig := parseEVMAmount(value)
	dataBytes, err := decodeHexLoose(data)
	if err != nil {
		return nil, fmt.Errorf("decode call data: %w", err)
	}

	toAddr := common.HexToAddress(to)
	msg := ethereum.CallMsg{
		From:     from,
		To:       &toAddr,
		Value:    valueBig,
		Data:     dataBytes,
		GasPrice: gasPrice,
	}
	gas, err := cli.EstimateGas(ctx, msg)
	if err != nil {
		return nil, fmt.Errorf("eth_estimateGas: %w", err)
	}
	// 20% buffer — estimateGas often under-prices contracts that branch
	// on storage reads, and reverts cost the whole gas anyway.
	gas = gas + gas/5

	out := map[string]string{
		"from":     from.Hex(),
		"to":       toAddr.Hex(),
		"value":    valueBig.String(),
		"data":     "0x" + hex.EncodeToString(dataBytes),
		"gas":      fmt.Sprintf("%d", gas),
		"gasPrice": gasPrice.String(),
		"nonce":    fmt.Sprintf("%d", nonce),
		"chainId":  chainID.String(),
	}
	return json.Marshal(out)
}

// buildERC20ApproveCallData returns the ABI-encoded call data for
// `approve(address spender, uint256 amount)` (selector 0x095ea7b3).
func buildERC20ApproveCallData(spender common.Address, amount *big.Int) []byte {
	sel, _ := hex.DecodeString("095ea7b3")
	out := make([]byte, 0, 4+32+32)
	out = append(out, sel...)
	out = append(out, common.LeftPadBytes(spender.Bytes(), 32)...)
	out = append(out, common.LeftPadBytes(amount.Bytes(), 32)...)
	return out
}

// evmAllowance reads ERC-20 allowance(owner, spender) via eth_call.
// Returns 0 if the call reverts (e.g. token not actually ERC-20) so the
// caller's `current.Cmp(want) < 0` branch fires and we attempt approve.
func evmAllowance(ctx context.Context, cli *ethclient.Client, token, owner, spender common.Address) (*big.Int, error) {
	sel, _ := hex.DecodeString("dd62ed3e") // allowance(address,address)
	callData := append(sel, common.LeftPadBytes(owner.Bytes(), 32)...)
	callData = append(callData, common.LeftPadBytes(spender.Bytes(), 32)...)
	msg := ethereum.CallMsg{To: &token, Data: callData}
	res, err := cli.CallContract(ctx, msg, nil)
	if err != nil {
		return new(big.Int), nil
	}
	if len(res) == 0 {
		return new(big.Int), nil
	}
	return new(big.Int).SetBytes(res), nil
}

// parseEVMAmount accepts either decimal or hex (`0x...`) and returns 0
// for an empty input. Used for the `value` field which NEXT may emit as
// either form depending on the route.
func parseEVMAmount(s string) *big.Int {
	s = strings.TrimSpace(s)
	if s == "" {
		return new(big.Int)
	}
	if strings.HasPrefix(s, "0x") || strings.HasPrefix(s, "0X") {
		v, ok := new(big.Int).SetString(s[2:], 16)
		if !ok {
			return new(big.Int)
		}
		return v
	}
	v, ok := new(big.Int).SetString(s, 10)
	if !ok {
		return new(big.Int)
	}
	return v
}

func decodeHexLoose(s string) ([]byte, error) {
	s = strings.TrimPrefix(strings.TrimPrefix(s, "0x"), "0X")
	if s == "" {
		return nil, nil
	}
	return hex.DecodeString(s)
}
