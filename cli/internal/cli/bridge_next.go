package cli

import (
	"context"
	"encoding/json"
	"fmt"
	"net/url"
	"strconv"
	"strings"

	"github.com/allbridge-io/rest-api/cli/internal/next"
	"github.com/allbridge-io/rest-api/cli/internal/render"
)

// resolveNextTokenRef takes "CHAIN:SYMBOL" or "CHAIN:ADDRESS" and finds
// the matching NEXT token (whose authoritative identifier is `tokenId`).
// We accept the same ref format as Core so users can reuse muscle memory.
func resolveNextTokenRef(toks []next.Token, ref string) (*next.Token, error) {
	parts := strings.SplitN(ref, ":", 2)
	if len(parts) != 2 {
		return nil, userErrf("token ref must be CHAIN:SYMBOL_OR_ADDRESS, got %q", ref)
	}
	chainU := strings.ToUpper(parts[0])
	q := strings.ToLower(parts[1])
	for i := range toks {
		if strings.ToUpper(toks[i].Chain) != chainU {
			continue
		}
		if strings.ToLower(toks[i].Symbol) == q || strings.ToLower(toks[i].Address) == q {
			return &toks[i], nil
		}
	}
	return nil, userErrf("token %q not found in NEXT", ref)
}

func runNextQuote(ctx context.Context, rt *runtime, fromRef, toRef, amount string) error {
	toks, err := rt.nextClient.Tokens(ctx)
	if err != nil {
		return netErr(err)
	}
	src, err := resolveNextTokenRef(toks, fromRef)
	if err != nil {
		return err
	}
	dst, err := resolveNextTokenRef(toks, toRef)
	if err != nil {
		return err
	}
	base, err := humanToBase(amount, src.Decimals)
	if err != nil {
		return userErr(err.Error())
	}
	routes, err := rt.nextClient.Quote(ctx, next.QuoteRequest{
		Amount: base, SourceTokenID: src.TokenID, DestinationTokenID: dst.TokenID,
	})
	if err != nil {
		return netErr(err)
	}
	if rt.format == render.FormatJSON || rt.format == render.FormatYAML {
		return render.Auto(render.Out(), rt.format, routes)
	}
	renderNextQuote(rt, src, dst, amount, routes)
	return nil
}

func renderNextQuote(rt *runtime, src, dst *next.Token, amount string, routes []next.Route) {
	s := rt.styles
	out := render.Out()
	fprintln(out, s.Brand.Render(fmt.Sprintf("%s %s → %s %s  [NEXT]",
		src.Chain, src.Symbol, dst.Chain, dst.Symbol)))
	kv(out, s, "amount", amount+" "+src.Symbol)
	fprintln(out, "")

	t := render.NewTable("messenger", "amountOut", "estTime", "relayerFee")
	for _, r := range routes {
		amtOut := baseToHuman(r.AmountOut, dst.Decimals) + " " + dst.Symbol
		eta := "-"
		if r.EstimatedTime > 0 {
			eta = fmt.Sprintf("%ds", r.EstimatedTime)
		}
		feeStr := "-"
		if len(r.RelayerFees) > 0 {
			f := r.RelayerFees[0]
			feeStr = f.Amount + " " + f.TokenID
		}
		t.Append(r.Messenger, amtOut, eta, feeStr)
	}
	t.Render(out, s)
}

// runBothQuote fetches quotes from both Core and NEXT in parallel, renders
// each side's options, and prints a one-line recommendation of which API
// delivers more of the destination token.
//
// Either side is allowed to fail (e.g. token not supported by that
// product); we still render whichever succeeded and skip the comparison.
func runBothQuote(ctx context.Context, rt *runtime, fromRef, toRef, amount string) error {
	type coreRes struct {
		src, dst map[string]any
		quote    json.RawMessage
		err      error
	}
	type nextRes struct {
		src, dst *next.Token
		routes   []next.Route
		err      error
	}
	coreCh := make(chan coreRes, 1)
	nextCh := make(chan nextRes, 1)

	go func() {
		var r coreRes
		defer func() { coreCh <- r }()
		toks, err := fetchTokens(ctx, rt, "")
		if err != nil {
			r.err = err
			return
		}
		if r.src, r.err = resolveTokenRef(toks, fromRef); r.err != nil {
			return
		}
		if r.dst, r.err = resolveTokenRef(toks, toRef); r.err != nil {
			return
		}
		q := url.Values{}
		q.Set("amount", amount)
		q.Set("sourceToken", getStr(r.src, "tokenAddress"))
		q.Set("destinationToken", getStr(r.dst, "tokenAddress"))
		r.err = rt.client.Get(ctx, "/bridge/quote", q, &r.quote)
	}()
	go func() {
		var r nextRes
		defer func() { nextCh <- r }()
		toks, err := rt.nextClient.Tokens(ctx)
		if err != nil {
			r.err = err
			return
		}
		if r.src, r.err = resolveNextTokenRef(toks, fromRef); r.err != nil {
			return
		}
		if r.dst, r.err = resolveNextTokenRef(toks, toRef); r.err != nil {
			return
		}
		base, err := humanToBase(amount, r.src.Decimals)
		if err != nil {
			r.err = err
			return
		}
		r.routes, r.err = rt.nextClient.Quote(ctx, next.QuoteRequest{
			Amount: base, SourceTokenID: r.src.TokenID, DestinationTokenID: r.dst.TokenID,
		})
	}()

	core := <-coreCh
	nx := <-nextCh

	if core.err != nil && nx.err != nil {
		return netErr(fmt.Errorf("both APIs failed:\n  core: %v\n  next: %v", core.err, nx.err))
	}

	if rt.format == render.FormatJSON || rt.format == render.FormatYAML {
		out := map[string]any{}
		if core.err == nil {
			out["core"] = core.quote
		} else {
			out["coreError"] = core.err.Error()
		}
		if nx.err == nil {
			out["next"] = nx.routes
		} else {
			out["nextError"] = nx.err.Error()
		}
		if core.err == nil && nx.err == nil {
			winner, coreBest, nextBest := pickWinner(core.dst, core.quote, nx.dst, nx.routes)
			out["recommendation"] = map[string]any{
				"winner":      winner,
				"coreBestOut": coreBest,
				"nextBestOut": nextBest,
			}
		}
		return render.Auto(render.Out(), rt.format, out)
	}

	s := rt.styles
	out := render.Out()
	fprintln(out, s.Brand.Render(fmt.Sprintf("%s → %s   amount %s", fromRef, toRef, amount)))
	fprintln(out, "")

	if core.err == nil {
		fprintln(out, s.Header.Render("Core"))
		renderQuote(rt, core.src, core.dst, amount, core.quote)
	} else {
		fprintln(out, s.Header.Render("Core"), s.Muted.Render("— "+core.err.Error()))
	}
	fprintln(out, "")
	if nx.err == nil {
		fprintln(out, s.Header.Render("NEXT"))
		renderNextQuote(rt, nx.src, nx.dst, amount, nx.routes)
	} else {
		fprintln(out, s.Header.Render("NEXT"), s.Muted.Render("— "+nx.err.Error()))
	}

	if core.err == nil && nx.err == nil {
		winner, coreBest, nextBest := pickWinner(core.dst, core.quote, nx.dst, nx.routes)
		fprintln(out, "")
		fprintln(out, formatRecommendation(s, winner, coreBest, nextBest, getStr(core.dst, "symbol")))
	}
	return nil
}

// pickWinner compares the best amountOut on each side. Returns "core" or
// "next" plus the human-unit float for each side (0 if no usable option).
//
// Caveat: Core's `estimatedAmount.max` and NEXT's `AmountOut` arrive in
// different shapes — Core is human float string, NEXT is base units that
// we convert via the destination token's decimals. We display both raw
// values so the user can sanity-check the "winner" claim.
func pickWinner(_ map[string]any, coreQuote json.RawMessage, nextDst *next.Token, nextRoutes []next.Route) (winner string, coreBest, nextBest float64) {
	coreBest = bestCoreOut(coreQuote)
	nextBest = bestNextOut(nextRoutes, nextDst.Decimals)
	if nextBest > coreBest {
		winner = "next"
	} else {
		winner = "core"
	}
	return
}

func bestCoreOut(raw json.RawMessage) float64 {
	var q map[string]any
	if err := json.Unmarshal(raw, &q); err != nil {
		return 0
	}
	opts, _ := q["options"].([]any)
	best := 0.0
	for _, ro := range opts {
		opt, _ := ro.(map[string]any)
		methods, _ := opt["paymentMethods"].([]any)
		for _, rm := range methods {
			pm, _ := rm.(map[string]any)
			est, _ := pm["estimatedAmount"].(map[string]any)
			v, err := strconv.ParseFloat(getStr(est, "max"), 64)
			if err == nil && v > best {
				best = v
			}
		}
	}
	return best
}

func bestNextOut(routes []next.Route, decimals int) float64 {
	best := 0.0
	for _, r := range routes {
		v, err := strconv.ParseFloat(baseToHuman(r.AmountOut, decimals), 64)
		if err == nil && v > best {
			best = v
		}
	}
	return best
}

func formatRecommendation(s render.Styles, winner string, coreBest, nextBest float64, sym string) string {
	loser := "Core"
	winnerName := "NEXT"
	winVal, loseVal := nextBest, coreBest
	if winner == "core" {
		winnerName, loser = "Core", "NEXT"
		winVal, loseVal = coreBest, nextBest
	}
	delta := winVal - loseVal
	pct := 0.0
	if loseVal > 0 {
		pct = delta / loseVal * 100
	}
	return s.Brand.Render(fmt.Sprintf(
		"recommended: %s — delivers %.6g %s (vs %.6g %s on %s, +%.6g, ~%.2f%%)",
		winnerName, winVal, sym, loseVal, sym, loser, delta, pct,
	))
}
