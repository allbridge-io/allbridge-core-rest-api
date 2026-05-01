package cli

import (
	"context"
	"fmt"
	"strings"

	"github.com/allbridge-io/rest-api/cli/internal/next"
	"github.com/allbridge-io/rest-api/cli/internal/render"
)

// nextSendParams is the inputs `bridge send --api next` consumes. Mirrors
// the subset of newBridgeSendCmd flags relevant to NEXT — we ignore EVM
// gas overrides etc. because Phase 2a never signs locally.
type nextSendParams struct {
	fromRef     string
	toRef       string
	amount      string // human units
	sender      string // required; we won't infer it because no wallet load
	recipient   string
	messenger   string // optional route filter (NEXT calls this string-keyed)
	feeTokenID  string // "native" | <tokenId>; defaults to "native"
	refundTo    string // NEAR-Intents-only
	dryRun      bool   // Phase 2a always treats this as true regardless
}

// nextSendResult is what we print at the end. Shape follows
// bridgeSendResult but only the fields NEXT actually populates.
type nextSendResult struct {
	SourceChain        string                 `json:"sourceChain"`
	DestinationChain   string                 `json:"destinationChain"`
	SourceTokenID      string                 `json:"sourceTokenId"`
	DestinationTokenID string                 `json:"destinationTokenId"`
	Amount             string                 `json:"amount"` // base units, what we sent to /tx/create
	AmountHuman        string                 `json:"amountHuman"`
	Sender             string                 `json:"sender"`
	Recipient          string                 `json:"recipient"`
	Messenger          string                 `json:"messenger"`
	RelayerFee         *next.RelayerFee       `json:"relayerFee,omitempty"`
	AmountOut          string                 `json:"amountOut"`
	AmountMin          string                 `json:"amountMin"`
	UnsignedTx         next.Tx                `json:"unsignedTx"`
}

func runNextBridgeSend(ctx context.Context, rt *runtime, p nextSendParams) error {
	if p.fromRef == "" || p.toRef == "" || p.amount == "" || p.recipient == "" || p.sender == "" {
		return userErr("--from, --to, --amount, --sender, --recipient are required for --api next")
	}
	if !p.dryRun {
		return userErr("native sign+broadcast for --api next not yet wired; pass --dry-run, sign with your tool, broadcast separately (Phase 2b will land this)")
	}

	toks, err := rt.nextClient.Tokens(ctx)
	if err != nil {
		return netErr(err)
	}
	src, err := resolveNextTokenRef(toks, p.fromRef)
	if err != nil {
		return err
	}
	dst, err := resolveNextTokenRef(toks, p.toRef)
	if err != nil {
		return err
	}

	baseAmount, err := humanToBase(p.amount, src.Decimals)
	if err != nil {
		return userErr(err.Error())
	}

	routes, err := rt.nextClient.Quote(ctx, next.QuoteRequest{
		Amount:             baseAmount,
		SourceTokenID:      src.TokenID,
		DestinationTokenID: dst.TokenID,
	})
	if err != nil {
		return netErr(err)
	}
	if len(routes) == 0 {
		return userErrf("no NEXT routes from %s to %s for amount %s", p.fromRef, p.toRef, p.amount)
	}

	route := pickNextRoute(routes, p.messenger)
	if route == nil {
		return userErrf("no NEXT route matches messenger %q (have: %s)", p.messenger, listNextMessengers(routes))
	}

	fee := pickRelayerFee(route.RelayerFees, p.feeTokenID)
	// fee may be nil for NEAR Intents (RelayerFee optional). For everything
	// else NEXT requires it; we'll pass through whatever pick returned and
	// let the API tell us if it's wrong.

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

	resp, err := rt.nextClient.CreateTx(ctx, createReq)
	if err != nil {
		return netErr(err)
	}

	result := nextSendResult{
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

	if rt.format == render.FormatJSON || rt.format == render.FormatYAML {
		return render.Auto(render.Out(), rt.format, result)
	}
	renderNextDryRun(rt, src, dst, result)
	return nil
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
	kv(out, s, "amountOut", baseToHuman(r.AmountOut, dst.Decimals)+" "+dst.Symbol+"  (min "+baseToHuman(r.AmountMin, dst.Decimals)+")")
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
