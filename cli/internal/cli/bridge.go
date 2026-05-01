package cli

import (
	"context"
	"encoding/json"
	"fmt"
	"net/url"
	"strings"

	"github.com/spf13/cobra"

	"github.com/allbridge-io/rest-api/cli/internal/render"
)

func newBridgeCmd() *cobra.Command {
	c := &cobra.Command{
		Use:   "bridge",
		Short: "Cross-chain transfer flow (quote, plan, send, calc, routes)",
		Long: `Cross-chain transfer subcommands. The typical flow is:

    bridge routes       discover which (source, destination) pairs are bridgeable
    bridge quote        preview fee, route options, estimated received amount
    bridge plan         get the unsigned transaction + quote in one JSON payload
    bridge send         build, sign and broadcast in one shot (EVM/SOL)
    bridge calc send    derive destination amount from a send amount
    bridge calc receive derive send amount from a desired receive amount

For chains without a native signer, use ` + "`allbridge tx build/sign/broadcast`" + `
instead of ` + "`bridge send`" + `. See the README cookbook for per-chain examples.`,
	}
	c.AddCommand(
		newBridgeRoutesCmd(),
		newBridgeQuoteCmd(),
		newBridgePlanCmd(),
		newBridgeSendCmd(),
		newBridgeCalcCmd(),
	)
	return c
}

func newBridgeRoutesCmd() *cobra.Command {
	var (
		from string
		to   string
	)
	c := &cobra.Command{
		Use:   "routes",
		Short: "List possible bridge routes",
		Long:  "Show every (source, destination) pair derivable from /tokens; filter with --from/--to chain symbols.",
		RunE: func(cmd *cobra.Command, _ []string) error {
			rt, err := resolve(cmd)
			if err != nil {
				return err
			}
			tokens, err := fetchTokens(cmd.Context(), rt, "")
			if err != nil {
				return netErr(err)
			}
			from = strings.ToUpper(from)
			to = strings.ToUpper(to)

			type route struct {
				FromChain string `json:"fromChain"`
				FromSym   string `json:"fromSymbol"`
				FromAddr  string `json:"fromAddress"`
				ToChain   string `json:"toChain"`
				ToSym     string `json:"toSymbol"`
				ToAddr    string `json:"toAddress"`
			}
			var routes []route
			for _, src := range tokens {
				if from != "" && strings.ToUpper(getStr(src, "chainSymbol")) != from {
					continue
				}
				for _, dst := range tokens {
					if dst["chainSymbol"] == src["chainSymbol"] {
						continue
					}
					if to != "" && strings.ToUpper(getStr(dst, "chainSymbol")) != to {
						continue
					}
					if getStr(src, "symbol") != getStr(dst, "symbol") {
						continue
					}
					routes = append(routes, route{
						FromChain: getStr(src, "chainSymbol"), FromSym: getStr(src, "symbol"), FromAddr: getStr(src, "tokenAddress"),
						ToChain: getStr(dst, "chainSymbol"), ToSym: getStr(dst, "symbol"), ToAddr: getStr(dst, "tokenAddress"),
					})
				}
			}
			if rt.format == render.FormatJSON || rt.format == render.FormatYAML {
				return render.Auto(render.Out(), rt.format, routes)
			}
			t := render.NewTable("from", "→", "to", "symbol")
			for _, r := range routes {
				t.Append(r.FromChain, "→", r.ToChain, r.FromSym)
			}
			t.Render(render.Out(), rt.styles)
			return nil
		},
	}
	c.Flags().StringVar(&from, "from", "", "filter by source chain symbol")
	c.Flags().StringVar(&to, "to", "", "filter by destination chain symbol")
	return c
}

func newBridgeQuoteCmd() *cobra.Command {
	var (
		fromRef string
		toRef   string
		amount  string
		api     string
	)
	c := &cobra.Command{
		Use:   "quote",
		Short: "Get a quote for a cross-chain transfer",
		Long: `Returns messenger options, fees and estimated received amount.

By default queries Allbridge Core. Use --api next to query the new
Allbridge NEXT product, or --api both to fetch quotes from both APIs
side-by-side with a recommendation of which delivers more.`,
		RunE: func(cmd *cobra.Command, _ []string) error {
			rt, err := resolve(cmd)
			if err != nil {
				return err
			}
			if amount == "" || fromRef == "" || toRef == "" {
				return userErr("--from, --to, --amount are required")
			}
			kind, err := parseAPIKind(api)
			if err != nil {
				return err
			}
			switch kind {
			case apiNext:
				return runNextQuote(cmd.Context(), rt, fromRef, toRef, amount)
			case apiBoth:
				return runBothQuote(cmd.Context(), rt, fromRef, toRef, amount)
			}
			return runCoreQuote(cmd.Context(), rt, fromRef, toRef, amount)
		},
	}
	c.Flags().StringVar(&fromRef, "from", "", "source token ref CHAIN:SYMBOL or CHAIN:ADDRESS")
	c.Flags().StringVar(&toRef, "to", "", "destination token ref")
	c.Flags().StringVar(&amount, "amount", "", "amount in human units (e.g. 100)")
	c.Flags().StringVar(&api, "api", "core", "which API to query: core|next|both")
	return c
}

func runCoreQuote(ctx context.Context, rt *runtime, fromRef, toRef, amount string) error {
	tokens, err := fetchTokens(ctx, rt, "")
	if err != nil {
		return netErr(err)
	}
	src, err := resolveTokenRef(tokens, fromRef)
	if err != nil {
		return err
	}
	dst, err := resolveTokenRef(tokens, toRef)
	if err != nil {
		return err
	}
	q := url.Values{}
	q.Set("amount", amount)
	q.Set("sourceToken", getStr(src, "tokenAddress"))
	q.Set("destinationToken", getStr(dst, "tokenAddress"))
	var quote json.RawMessage
	if err := rt.client.Get(ctx, "/bridge/quote", q, &quote); err != nil {
		return netErr(err)
	}
	if rt.format == render.FormatJSON || rt.format == render.FormatYAML {
		return render.Auto(render.Out(), rt.format, quote)
	}
	renderQuote(rt, src, dst, amount, quote)
	return nil
}

func newBridgeCalcCmd() *cobra.Command {
	c := &cobra.Command{
		Use:   "calc",
		Short: "Quick send/receive amount calculators",
	}

	var fromRef, toRef, amount string

	send := &cobra.Command{
		Use:   "send",
		Short: "Calculate destination amount for a given send amount",
		RunE: func(cmd *cobra.Command, _ []string) error {
			rt, err := resolve(cmd)
			if err != nil {
				return err
			}
			return runCalc(cmd.Context(), rt, "/bridge/send/calculate", fromRef, toRef, amount)
		},
	}
	send.Flags().StringVar(&fromRef, "from", "", "source token ref")
	send.Flags().StringVar(&toRef, "to", "", "destination token ref")
	send.Flags().StringVar(&amount, "amount", "", "send amount (human units)")

	recv := &cobra.Command{
		Use:   "receive",
		Short: "Calculate send amount needed for a desired receive amount",
		RunE: func(cmd *cobra.Command, _ []string) error {
			rt, err := resolve(cmd)
			if err != nil {
				return err
			}
			return runCalc(cmd.Context(), rt, "/bridge/receive/calculate", fromRef, toRef, amount)
		},
	}
	recv.Flags().StringVar(&fromRef, "from", "", "source token ref")
	recv.Flags().StringVar(&toRef, "to", "", "destination token ref")
	recv.Flags().StringVar(&amount, "amount", "", "desired receive amount (human units)")

	c.AddCommand(send, recv)
	return c
}

func runCalc(ctx context.Context, rt *runtime, path, fromRef, toRef, amount string) error {
	if fromRef == "" || toRef == "" || amount == "" {
		return userErr("--from, --to, --amount are required")
	}
	tokens, err := fetchTokens(ctx, rt, "")
	if err != nil {
		return netErr(err)
	}
	src, err := resolveTokenRef(tokens, fromRef)
	if err != nil {
		return err
	}
	dst, err := resolveTokenRef(tokens, toRef)
	if err != nil {
		return err
	}
	q := url.Values{}
	q.Set("amount", amount)
	q.Set("sourceToken", getStr(src, "tokenAddress"))
	q.Set("destinationToken", getStr(dst, "tokenAddress"))
	var raw json.RawMessage
	if err := rt.client.Get(ctx, path, q, &raw); err != nil {
		return netErr(err)
	}
	if rt.format == render.FormatJSON || rt.format == render.FormatYAML {
		return render.Auto(render.Out(), rt.format, raw)
	}
	var m map[string]any
	_ = json.Unmarshal(raw, &m)
	s := rt.styles
	out := render.Out()
	kv(out, s, "amountIn", getStr(m, "amountInFloat"))
	kv(out, s, "amountOut", getStr(m, "amountReceivedInFloat"))
	return nil
}

func renderQuote(rt *runtime, src, dst map[string]any, amount string, raw json.RawMessage) {
	var q map[string]any
	_ = json.Unmarshal(raw, &q)
	s := rt.styles
	out := render.Out()

	fprintln(out, s.Brand.Render(fmt.Sprintf("%s %s → %s %s",
		getStr(src, "chainSymbol"), getStr(src, "symbol"),
		getStr(dst, "chainSymbol"), getStr(dst, "symbol"))))
	kv(out, s, "amount", amount+" "+getStr(src, "symbol"))
	kv(out, s, "amountInt", getStr(q, "amountInt"))
	kv(out, s, "amountFloat", getStr(q, "amountFloat"))
	fprintln(out, "")

	opts, _ := q["options"].([]any)
	t := render.NewTable("messenger", "fee", "payment", "estTime", "minOut", "maxOut")
	for _, raw := range opts {
		opt, _ := raw.(map[string]any)
		messenger := getStr(opt, "messenger")
		etaMs := getStr(opt, "estimatedTimeMs")
		methods, _ := opt["paymentMethods"].([]any)
		for _, raw := range methods {
			pm, _ := raw.(map[string]any)
			est, _ := pm["estimatedAmount"].(map[string]any)
			t.Append(
				messenger,
				getStr(pm, "fee"),
				getStr(pm, "feePaymentMethod"),
				etaMs+" ms",
				getStr(est, "min"),
				getStr(est, "max"),
			)
		}
	}
	t.Render(out, s)
}
