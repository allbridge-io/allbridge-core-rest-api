package cli

import (
	"context"
	"encoding/json"
	"fmt"
	"net/url"
	"sort"
	"strings"

	"github.com/spf13/cobra"

	"github.com/allbridge-io/rest-api/cli/internal/render"
)

func newTokensCmd() *cobra.Command {
	c := &cobra.Command{
		Use:   "tokens",
		Short: "Inspect supported tokens",
	}
	c.AddCommand(newTokensListCmd(), newTokensShowCmd())
	return c
}

func newTokensListCmd() *cobra.Command {
	var (
		chain    string
		tokenSym string
		poolType string
		api      string
	)
	c := &cobra.Command{
		Use:   "ls",
		Short: "List supported tokens (Allbridge Core, NEXT, or both)",
		Long: `List tokens supported by either product. Pass --api next for the new
product, --api both for a unified view with a SOURCE column showing which
API each entry comes from.`,
		Args: cobra.NoArgs,
		RunE: func(cmd *cobra.Command, _ []string) error {
			rt, err := resolve(cmd)
			if err != nil {
				return err
			}
			kind, err := parseAPIKind(api)
			if err != nil {
				return err
			}
			rows, err := listTokensFromAPI(cmd.Context(), rt, kind, poolType, chain, tokenSym)
			if err != nil {
				return netErr(err)
			}
			if rt.format == render.FormatJSON || rt.format == render.FormatYAML {
				return render.Auto(render.Out(), rt.format, rows)
			}
			renderTokensTable(rt, kind, rows)
			return nil
		},
	}
	c.Flags().StringVar(&chain, "chain", "", "filter by chain symbol (e.g. ETH)")
	c.Flags().StringVar(&tokenSym, "symbol", "", "filter by token symbol (e.g. USDT)")
	c.Flags().StringVar(&poolType, "type", "", "(core only) filter by pool type (swap|pool)")
	c.Flags().StringVar(&api, "api", "core", "which API to query: core|next|both")
	return c
}

// unifiedToken is the table-row shape we render for `tokens ls`. Either
// product fills it; for --api both, Source is "core" or "next" so the user
// can see at a glance where each entry came from.
type unifiedToken struct {
	Source   string `json:"source"`
	Chain    string `json:"chain"`
	Symbol   string `json:"symbol"`
	Decimals int    `json:"decimals"`
	Address  string `json:"address"`
	TokenID  string `json:"tokenId,omitempty"` // NEXT only
	FeeShare string `json:"feeShare,omitempty"` // Core only
	APR      string `json:"apr,omitempty"`      // Core only
}

func listTokensFromAPI(ctx context.Context, rt *runtime, kind apiKind, poolType, chain, sym string) ([]unifiedToken, error) {
	var out []unifiedToken
	if kind == apiCore || kind == apiBoth {
		raw, err := fetchTokens(ctx, rt, poolType)
		if err != nil {
			return nil, err
		}
		raw = filterTokens(raw, chain, sym)
		for _, tk := range raw {
			dec := 0
			if d := getStr(tk, "decimals"); d != "" {
				_, _ = fmt.Sscanf(d, "%d", &dec)
			}
			out = append(out, unifiedToken{
				Source: "core", Chain: getStr(tk, "chainSymbol"), Symbol: getStr(tk, "symbol"),
				Decimals: dec, Address: getStr(tk, "tokenAddress"),
				FeeShare: getStr(tk, "feeShare"), APR: getStr(tk, "apr"),
			})
		}
	}
	if kind == apiNext || kind == apiBoth {
		toks, err := rt.nextClient.Tokens(ctx)
		if err != nil {
			return nil, err
		}
		chainU := strings.ToUpper(chain)
		symU := strings.ToUpper(sym)
		for _, t := range toks {
			if chainU != "" && strings.ToUpper(t.Chain) != chainU {
				continue
			}
			if symU != "" && strings.ToUpper(t.Symbol) != symU {
				continue
			}
			out = append(out, unifiedToken{
				Source: "next", Chain: t.Chain, Symbol: t.Symbol,
				Decimals: t.Decimals, Address: t.Address, TokenID: t.TokenID,
			})
		}
	}
	sort.SliceStable(out, func(i, j int) bool {
		if out[i].Chain != out[j].Chain {
			return out[i].Chain < out[j].Chain
		}
		if out[i].Symbol != out[j].Symbol {
			return out[i].Symbol < out[j].Symbol
		}
		return out[i].Source < out[j].Source
	})
	return out, nil
}

func renderTokensTable(rt *runtime, kind apiKind, rows []unifiedToken) {
	var t *render.Table
	if kind == apiBoth {
		t = render.NewTable("source", "chain", "symbol", "decimals", "address", "tokenId/fee")
		for _, r := range rows {
			extra := r.FeeShare
			if r.Source == "next" {
				extra = r.TokenID
			}
			t.Append(r.Source, r.Chain, r.Symbol, r.Decimals, r.Address, extra)
		}
	} else if kind == apiNext {
		t = render.NewTable("chain", "symbol", "decimals", "address", "tokenId")
		for _, r := range rows {
			t.Append(r.Chain, r.Symbol, r.Decimals, r.Address, r.TokenID)
		}
	} else {
		t = render.NewTable("chain", "symbol", "decimals", "address", "side fee", "apr")
		for _, r := range rows {
			t.Append(r.Chain, r.Symbol, r.Decimals, r.Address, r.FeeShare, r.APR)
		}
	}
	t.Render(render.Out(), rt.styles)
}

func newTokensShowCmd() *cobra.Command {
	c := &cobra.Command{
		Use:   "show <chain> <symbol|address>",
		Short: "Show one token",
		Args:  cobra.ExactArgs(2),
		RunE: func(cmd *cobra.Command, args []string) error {
			rt, err := resolve(cmd)
			if err != nil {
				return err
			}
			tokens, err := fetchTokens(cmd.Context(), rt, "")
			if err != nil {
				return netErr(err)
			}
			tk := findToken(tokens, args[0], args[1])
			if tk == nil {
				return userErrf("token not found: %s on %s", args[1], args[0])
			}
			if rt.format == render.FormatJSON || rt.format == render.FormatYAML {
				return render.Auto(render.Out(), rt.format, tk)
			}
			s := rt.styles
			out := render.Out()
			fprintln(out, s.Header.Render("TOKEN  "), getStr(tk, "symbol"), s.Muted.Render("on"), getStr(tk, "chainSymbol"))
			kv(out, s, "name", getStr(tk, "name"))
			kv(out, s, "decimals", getStr(tk, "decimals"))
			kv(out, s, "address", getStr(tk, "tokenAddress"))
			kv(out, s, "pool", getStr(tk, "poolAddress"))
			kv(out, s, "side fee", getStr(tk, "feeShare"))
			kv(out, s, "apr", getStr(tk, "apr"))
			return nil
		},
	}
	return c
}

func fetchTokens(ctx context.Context, rt *runtime, poolType string) ([]map[string]any, error) {
	q := url.Values{}
	if poolType != "" {
		q.Set("type", poolType)
	}
	var raw json.RawMessage
	if err := rt.client.Get(ctx, "/tokens", q, &raw); err != nil {
		return nil, err
	}
	var out []map[string]any
	if err := json.Unmarshal(raw, &out); err != nil {
		return nil, err
	}
	return out, nil
}

func filterTokens(in []map[string]any, chain, symbol string) []map[string]any {
	if chain == "" && symbol == "" {
		return in
	}
	chain = strings.ToUpper(chain)
	symbol = strings.ToUpper(symbol)
	out := make([]map[string]any, 0, len(in))
	for _, tk := range in {
		if chain != "" && strings.ToUpper(getStr(tk, "chainSymbol")) != chain {
			continue
		}
		if symbol != "" && strings.ToUpper(getStr(tk, "symbol")) != symbol {
			continue
		}
		out = append(out, tk)
	}
	return out
}

func findToken(in []map[string]any, chain, symOrAddr string) map[string]any {
	chainU := strings.ToUpper(chain)
	q := strings.ToLower(symOrAddr)
	for _, tk := range in {
		if strings.ToUpper(getStr(tk, "chainSymbol")) != chainU {
			continue
		}
		if strings.ToLower(getStr(tk, "symbol")) == q || strings.ToLower(getStr(tk, "tokenAddress")) == q {
			return tk
		}
	}
	return nil
}

func resolveTokenRef(in []map[string]any, ref string) (map[string]any, error) {
	parts := strings.SplitN(ref, ":", 2)
	if len(parts) != 2 {
		return nil, userErrf("token ref must be CHAIN:SYMBOL_OR_ADDRESS, got %q", ref)
	}
	tk := findToken(in, parts[0], parts[1])
	if tk == nil {
		return nil, userErrf("token %q not found", ref)
	}
	return tk, nil
}
