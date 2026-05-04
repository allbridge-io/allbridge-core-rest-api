package cli

import (
	"context"
	"encoding/base64"
	"fmt"
	"strings"
	"time"

	"github.com/allbridge-io/rest-api/cli/internal/broadcast"
	"github.com/allbridge-io/rest-api/cli/internal/next"
	"github.com/allbridge-io/rest-api/cli/internal/render"
	"github.com/allbridge-io/rest-api/cli/internal/sign"
	"github.com/allbridge-io/rest-api/cli/internal/wallet"
)

// nextSendParams is the inputs `bridge send --api next` consumes. Mirrors
// the subset of newBridgeSendCmd flags relevant to NEXT.
type nextSendParams struct {
	fromRef           string
	toRef             string
	amount            string // human units
	sender            string // optional when not dry-run (defaults to wallet address); required for dry-run
	recipient         string
	messenger         string // route filter; ignored unless messengerExplicit is true
	messengerExplicit bool   // true iff user actually passed --messenger
	feeTokenID        string // "native" | <tokenId>; defaults to "native"
	refundTo          string // NEAR-Intents-only

	dryRun           bool
	walletName       string // for sign+broadcast; falls back to cfg.DefaultWallet
	rpcURL           string // overrides cfg.RPC[<chain>]
	approve          bool   // EVM only: auto-approve relayerFee.approvalSpender if needed
	approveWait      time.Duration
	progress         bool
	progressInterval time.Duration
	progressTimeout  time.Duration

	// passphrase, when non-empty, replaces the keystore-prompt path.
	// Used by the TUI execution flow which collects the passphrase
	// inline; CLI callers leave it empty so promptPassphrase still runs.
	passphrase string
	// onProgress, when non-nil, is called at each pipeline phase
	// transition. CLI callers leave it nil and rely on direct stdout.
	onProgress ProgressFunc
}

// nextSendResult is what we print at the end. Shape follows
// bridgeSendResult but only the fields NEXT actually populates.
type nextSendResult struct {
	SourceChain        string           `json:"sourceChain"`
	DestinationChain   string           `json:"destinationChain"`
	SourceTokenID      string           `json:"sourceTokenId"`
	DestinationTokenID string           `json:"destinationTokenId"`
	Amount             string           `json:"amount"` // base units, what we sent to /tx/create
	AmountHuman        string           `json:"amountHuman"`
	Sender             string           `json:"sender"`
	Recipient          string           `json:"recipient"`
	Messenger          string           `json:"messenger"`
	RelayerFee         *next.RelayerFee `json:"relayerFee,omitempty"`
	AmountOut          string           `json:"amountOut"`
	AmountMin          string           `json:"amountMin"`
	UnsignedTx         next.Tx          `json:"unsignedTx"`
	ApproveTxHash      string           `json:"approveTxHash,omitempty"` // populated when EVM approve fired
	TxHash             string           `json:"txHash,omitempty"`        // populated on live send
}

// runNextBridgeSend is the CLI entry point — preserves the existing UX
// (renders to stdout, kicks off --progress watcher when set). TUI callers
// should use executeNextBridgeSend instead, which returns the result
// struct (and src/dst token info) without touching stdout.
func runNextBridgeSend(ctx context.Context, rt *runtime, p nextSendParams) error {
	result, src, dst, err := executeNextBridgeSend(ctx, rt, p)
	if err != nil {
		return err
	}
	if rt.format == render.FormatJSON || rt.format == render.FormatYAML {
		if err := render.Auto(render.Out(), rt.format, result); err != nil {
			return err
		}
	} else if p.dryRun {
		renderNextDryRun(rt, src, dst, *result)
	} else {
		renderNextSend(rt, src, dst, *result)
	}
	if !p.dryRun && p.progress && result.TxHash != "" {
		return runTransfersStatusNext(ctx, rt, result.TxHash, true, p.progressInterval, p.progressTimeout)
	}
	return nil
}

// executeNextBridgeSend runs the entire NEXT pipeline (resolve, quote,
// createTx, optional sign+broadcast) and returns the populated result
// alongside the token metadata callers need to render exit screens.
// Emits Progress events through p.onProgress at every phase transition.
func executeNextBridgeSend(ctx context.Context, rt *runtime, p nextSendParams) (*nextSendResult, *next.Token, *next.Token, error) {
	if p.fromRef == "" || p.toRef == "" || p.amount == "" || p.recipient == "" {
		return nil, nil, nil, userErr("--from, --to, --amount, --recipient are required for --api next")
	}

	// Wallet load happens up front for the live path so we can default
	// `--sender` to the wallet address (matching Core's UX) and refuse
	// early if the wallet doesn't exist.
	var entry wallet.Entry
	if !p.dryRun {
		st, err := wallet.Load()
		if err != nil {
			return nil, nil, nil, walletErr(err.Error())
		}
		name := p.walletName
		if name == "" {
			name = rt.cfg.DefaultWallet
		}
		entry, err = st.Get(name)
		if err != nil {
			return nil, nil, nil, walletErr(err.Error())
		}
		if p.sender == "" {
			p.sender = entry.Address
		} else if !strings.EqualFold(p.sender, entry.Address) {
			return nil, nil, nil, walletErrf("wallet address %s does not match --sender %s", entry.Address, p.sender)
		}
	}
	if p.sender == "" {
		return nil, nil, nil, userErr("--sender is required (or omit it and use a wallet without --dry-run)")
	}

	p.onProgress.emit(Progress{Phase: PhaseQuote, Status: PhaseRunning, Note: "fetching tokens + routes"})
	toks, err := rt.nextClient.Tokens(ctx)
	if err != nil {
		p.onProgress.emit(Progress{Phase: PhaseQuote, Status: PhaseFailed, Err: err})
		return nil, nil, nil, netErr(err)
	}
	src, err := resolveNextTokenRef(toks, p.fromRef)
	if err != nil {
		p.onProgress.emit(Progress{Phase: PhaseQuote, Status: PhaseFailed, Err: err})
		return nil, nil, nil, err
	}
	dst, err := resolveNextTokenRef(toks, p.toRef)
	if err != nil {
		p.onProgress.emit(Progress{Phase: PhaseQuote, Status: PhaseFailed, Err: err})
		return nil, nil, nil, err
	}

	baseAmount, err := humanToBase(p.amount, src.Decimals)
	if err != nil {
		return nil, nil, nil, userErr(err.Error())
	}

	routes, err := rt.nextClient.Quote(ctx, next.QuoteRequest{
		Amount:             baseAmount,
		SourceTokenID:      src.TokenID,
		DestinationTokenID: dst.TokenID,
	})
	if err != nil {
		return nil, nil, nil, netErr(err)
	}
	if len(routes) == 0 {
		return nil, nil, nil, userErrf("no NEXT routes from %s to %s for amount %s", p.fromRef, p.toRef, p.amount)
	}

	// NEXT routes use messenger names like "cctp", "Allbridge", "near-intents",
	// not Core's uppercase enum. Only filter if the user explicitly passed
	// --messenger; otherwise let NEXT's own ordering pick the best route.
	filter := ""
	if p.messengerExplicit {
		filter = p.messenger
	}
	route := pickNextRoute(routes, filter)
	if route == nil {
		return nil, nil, nil, userErrf("no NEXT route matches messenger %q (have: %s)", p.messenger, listNextMessengers(routes))
	}

	fee := pickRelayerFee(route.RelayerFees, p.feeTokenID)

	createReq := next.CreateTxRequest{
		SourceTokenID:                  route.SourceTokenID,
		SourceSwap:                     route.SourceSwap,
		SourceIntermediaryTokenID:      route.SourceIntermediaryTokenID,
		Messenger:                      route.Messenger,
		DestinationIntermediaryTokenID: route.DestinationIntermediaryTokenID,
		DestinationSwap:                route.DestinationSwap,
		DestinationTokenID:             route.DestinationTokenID,
		EstimatedTime:                  route.EstimatedTime,
		Amount:                         baseAmount,
		SourceAddress:                  p.sender,
		DestinationAddress:             p.recipient,
		RelayerFee:                     fee,
		RefundTo:                       p.refundTo,
	}

	p.onProgress.emit(Progress{Phase: PhaseQuote, Status: PhaseDone, Note: route.Messenger})
	p.onProgress.emit(Progress{Phase: PhaseBuild, Status: PhaseRunning, Note: "POST /tx/create"})
	resp, err := rt.nextClient.CreateTx(ctx, createReq)
	if err != nil {
		p.onProgress.emit(Progress{Phase: PhaseBuild, Status: PhaseFailed, Err: err})
		return nil, nil, nil, netErr(err)
	}
	p.onProgress.emit(Progress{Phase: PhaseBuild, Status: PhaseDone})

	result := &nextSendResult{
		SourceChain:        src.Chain,
		DestinationChain:   dst.Chain,
		SourceTokenID:      src.TokenID,
		DestinationTokenID: dst.TokenID,
		Amount:             baseAmount,
		AmountHuman:        p.amount,
		Sender:             p.sender,
		Recipient:          p.recipient,
		Messenger:          route.Messenger,
		RelayerFee:         fee,
		AmountOut:          resp.AmountOut,
		AmountMin:          resp.AmountMin,
		UnsignedTx:         resp.Tx,
	}

	if p.dryRun {
		return result, src, dst, nil
	}

	approveHash, receipt, err := nextSignAndBroadcast(
		ctx, rt, entry, src, &resp.Tx, fee, baseAmount, p.rpcURL,
		p.approve, p.approveWait, p.passphrase, p.onProgress,
	)
	if err != nil {
		return result, src, dst, err
	}
	result.ApproveTxHash = approveHash
	result.TxHash = receipt.Hash
	if u := txExplorerURL(src.Chain, receipt.Hash, rt.cfg.Network); u != "" {
		p.onProgress.emit(Progress{Phase: PhaseBroadcast, Status: PhaseDone, Hash: receipt.Hash, ExplorerURL: u})
	}
	return result, src, dst, nil
}

// nextChainFamily maps a NEXT chain symbol to the wallet family that can
// sign for it. Only supported chains are listed; unknowns return an error
// so we don't silently sign with the wrong key when NEXT adds a new chain.
func nextChainFamily(chain string) (wallet.Family, error) {
	switch strings.ToUpper(chain) {
	case "SOL":
		return wallet.FamilySolana, nil
	case "TRX":
		return wallet.FamilyTron, nil
	case "ETH", "ARB", "BAS", "BASE", "AVA", "OPT", "POL", "POLY", "BNB", "BSC", "SPL", "AMO", "CEL":
		return wallet.FamilyEVM, nil
	case "SRB":
		return wallet.FamilySoroban, nil
	case "STX":
		return wallet.FamilyStacks, nil
	case "ALG":
		return wallet.FamilyAlgorand, nil
	}
	return "", chainErrf("nextChainFamily: unknown NEXT chain %q (add to the mapping)", chain)
}

// nextSignAndBroadcast fans the unsigned NEXT transaction out to the
// chain-specific signing+broadcasting code path. Returns approve tx hash
// (empty when no approve happened) plus the bridge tx receipt.
//
// `passphrase` short-circuits the keystore prompt when non-empty (TUI
// passes the value it collected inline). `onProgress` receives one event
// per phase transition; nil disables emissions for CLI callers.
func nextSignAndBroadcast(
	ctx context.Context, rt *runtime, entry wallet.Entry,
	src *next.Token, tx *next.Tx, fee *next.RelayerFee,
	bridgeAmountBase, rpcOverride string,
	doApprove bool, approveWait time.Duration,
	passphrase string, onProgress ProgressFunc,
) (approveHash string, receipt *broadcast.Receipt, err error) {
	family, err := nextChainFamily(src.Chain)
	if err != nil {
		return "", nil, err
	}
	if family != entry.Family {
		return "", nil, walletErrf("wallet family %s cannot sign for %s (chain %s)", entry.Family, family, src.Chain)
	}

	rpc := rpcOverride
	if rpc == "" {
		rpc = rt.cfg.RPC[strings.ToUpper(src.Chain)]
	}
	if rpc == "" {
		return "", nil, chainErrf("no RPC URL configured for %s — set rpc.%s in config or pass --rpc", src.Chain, strings.ToUpper(src.Chain))
	}

	switch family {
	case wallet.FamilySolana:
		r, e := signAndBroadcastNextSolana(ctx, entry, tx, rpc, src.Chain, passphrase, onProgress)
		return "", r, e
	case wallet.FamilyEVM:
		out, e := signAndBroadcastNextEVM(ctx, entry, nextEVMSendParams{
			tx:               tx,
			srcToken:         src,
			relayerFee:       fee,
			bridgeAmountBase: bridgeAmountBase,
			rpcURL:           rpc,
			doApprove:        doApprove,
			approveWait:      approveWait,
			passphrase:       passphrase,
			onProgress:       onProgress,
			network:          rt.cfg.Network,
		})
		if e != nil {
			return "", nil, e
		}
		return out.ApproveTxHash, out.Receipt, nil
	case wallet.FamilyTron:
		out, e := signAndBroadcastNextTRX(ctx, entry, nextTRXSendParams{
			tx:               tx,
			srcToken:         src,
			relayerFee:       fee,
			bridgeAmountBase: bridgeAmountBase,
			rpcURL:           rpc,
			doApprove:        doApprove,
			approveWait:      approveWait,
			passphrase:       passphrase,
			onProgress:       onProgress,
			network:          rt.cfg.Network,
		})
		if e != nil {
			return "", nil, e
		}
		return out.ApproveTxHash, out.Receipt, nil
	}
	return "", nil, chainErrf("native sign+broadcast not supported for family %s on NEXT", family)
}

func signAndBroadcastNextSolana(ctx context.Context, entry wallet.Entry, tx *next.Tx, rpcURL, chainSymbol, passphrase string, onProgress ProgressFunc) (*broadcast.Receipt, error) {
	if tx.Tx == "" {
		return nil, chainErr("NEXT returned an empty Solana transaction payload")
	}
	txBytes, err := base64.StdEncoding.DecodeString(tx.Tx)
	if err != nil {
		return nil, chainErrf("decode NEXT Solana tx (base64): %v", err)
	}

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

	onProgress.emit(Progress{Phase: PhaseSign, Status: PhaseRunning})
	signed, err := sign.SignSolanaTxBytes(secret, txBytes, chainSymbol)
	if err != nil {
		onProgress.emit(Progress{Phase: PhaseSign, Status: PhaseFailed, Err: err})
		return nil, chainErr(err.Error())
	}
	onProgress.emit(Progress{Phase: PhaseSign, Status: PhaseDone})

	caster, err := broadcast.For(wallet.FamilySolana)
	if err != nil {
		return nil, chainErr(err.Error())
	}
	onProgress.emit(Progress{Phase: PhaseBroadcast, Status: PhaseRunning, Note: rpcURL})
	receipt, err := caster.Broadcast(ctx, signed, broadcast.Options{RPCURL: rpcURL})
	if err != nil {
		onProgress.emit(Progress{Phase: PhaseBroadcast, Status: PhaseFailed, Err: err})
		return nil, chainErr(err.Error())
	}
	return receipt, nil
}

func renderNextSend(rt *runtime, src, dst *next.Token, r nextSendResult) {
	out := render.Out()
	s := rt.styles
	fprintln(out, s.Header.Render("NEXT BRIDGE SENT"))
	if r.ApproveTxHash != "" {
		kv(out, s, "approveTxHash", r.ApproveTxHash)
		if u := txExplorerURL(src.Chain, r.ApproveTxHash, rt.cfg.Network); u != "" {
			kv(out, s, "approveLink", u)
		}
	}
	kv(out, s, "txHash", r.TxHash)
	if u := txExplorerURL(src.Chain, r.TxHash, rt.cfg.Network); u != "" {
		kv(out, s, "link", u)
	}
	kv(out, s, "route", fmt.Sprintf("%s %s → %s %s", src.Chain, src.Symbol, dst.Chain, dst.Symbol))
	kv(out, s, "messenger", r.Messenger)
	kv(out, s, "amount", r.AmountHuman+" "+src.Symbol)
	kv(out, s, "amountOut", formatAmountOut(r.AmountOut, r.AmountMin, dst))
	kv(out, s, "sender", r.Sender)
	kv(out, s, "recipient", r.Recipient)
	if r.RelayerFee != nil {
		kv(out, s, "relayerFee", r.RelayerFee.Amount+" of "+r.RelayerFee.TokenID)
	}
}

func formatAmountOut(amountOut, amountMin string, dst *next.Token) string {
	out := baseToHuman(amountOut, dst.Decimals) + " " + dst.Symbol
	if amountMin != "" {
		out += "  (min " + baseToHuman(amountMin, dst.Decimals) + ")"
	}
	return out
}

// pickNextRoute prefers the first route whose messenger matches `prefer`
// (case-insensitive). If `prefer` is empty, returns the first route —
// NEXT orders routes by its own preference, so route[0] is "best".
func pickNextRoute(routes []next.Route, prefer string) *next.Route {
	if prefer != "" {
		want := strings.ToLower(prefer)
		for i := range routes {
			if strings.ToLower(routes[i].Messenger) == want {
				return &routes[i]
			}
		}
		return nil
	}
	return &routes[0]
}

// pickRelayerFee returns the entry that matches `prefer` exactly. If
// `prefer == ""` (the default) we pick "native" if present, otherwise
// the first entry — that mirrors what the NEXT web app does when the
// user hasn't actively chosen a fee token.
func pickRelayerFee(fees []next.RelayerFee, prefer string) *next.RelayerFee {
	if len(fees) == 0 {
		return nil
	}
	if prefer != "" {
		for i := range fees {
			if fees[i].TokenID == prefer {
				return &fees[i]
			}
		}
		return nil
	}
	for i := range fees {
		if fees[i].TokenID == "native" {
			return &fees[i]
		}
	}
	return &fees[0]
}

func listNextMessengers(routes []next.Route) string {
	seen := map[string]bool{}
	out := make([]string, 0, len(routes))
	for _, r := range routes {
		if !seen[r.Messenger] {
			seen[r.Messenger] = true
			out = append(out, r.Messenger)
		}
	}
	return strings.Join(out, ", ")
}

func renderNextDryRun(rt *runtime, src, dst *next.Token, r nextSendResult) {
	out := render.Out()
	s := rt.styles
	fprintln(out, s.Header.Render("NEXT BRIDGE TX BUILT  (dry-run / detached)"))
	kv(out, s, "route", fmt.Sprintf("%s %s → %s %s", src.Chain, src.Symbol, dst.Chain, dst.Symbol))
	kv(out, s, "messenger", r.Messenger)
	kv(out, s, "amount", r.AmountHuman+" "+src.Symbol+"  ("+r.Amount+" base units)")
	kv(out, s, "amountOut", formatAmountOut(r.AmountOut, r.AmountMin, dst))
	kv(out, s, "sender", r.Sender)
	kv(out, s, "recipient", r.Recipient)
	if r.RelayerFee != nil {
		kv(out, s, "relayerFee", r.RelayerFee.Amount+" of "+r.RelayerFee.TokenID)
		if r.RelayerFee.ApprovalSpender != "" {
			kv(out, s, "approveSpender", r.RelayerFee.ApprovalSpender+"  (approve before broadcast)")
		}
	}
	fprintln(out, "")
	fprintln(out, s.Header.Render("UNSIGNED TX"))
	kv(out, s, "contractAddress", r.UnsignedTx.ContractAddress)
	kv(out, s, "value", r.UnsignedTx.Value)
	if r.UnsignedTx.Tx != "" {
		kv(out, s, "tx", "(see --json output for full payload)")
	}
	fprintln(out, "")
	fprintln(out, s.Muted.Render("Sign and broadcast with your chain's native tool. For an"))
	fprintln(out, s.Muted.Render("EVM chain you'll also need to fetch nonce + gas before signing."))
}
