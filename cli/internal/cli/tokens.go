package cli

import (
	"context"
	"encoding/json"
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
	)
	c := &cobra.Command{
		Use:   "ls",
		Short: "List supported tokens",
		Args:  cobra.NoArgs,
		RunE: func(cmd *cobra.Command, _ []string) error {
			rt, err := resolve(cmd)
			if err != nil {
				return err
			}
			tokens, err := fetchTokens(cmd.Context(), rt, poolType)
			if err != nil {
				return netErr(err)
			}
			tokens = filterTokens(tokens, chain, tokenSym)
			sort.SliceStable(tokens, func(i, j int) bool {
				if tokens[i]["chainSymbol"] != tokens[j]["chainSymbol"] {
					return getStr(tokens[i], "chainSymbol") < getStr(tokens[j], "chainSymbol")
				}
				return getStr(tokens[i], "symbol") < getStr(tokens[j], "symbol")
			})
			if rt.format == render.FormatJSON || rt.format == render.FormatYAML {
				return render.Auto(render.Out(), rt.format, tokens)
			}
			t := render.NewTable("chain", "symbol", "decimals", "address", "side fee", "apr")
			for _, tk := range tokens {
				t.Append(
					getStr(tk, "chainSymbol"),
					getStr(tk, "symbol"),
					getStr(tk, "decimals"),
					getStr(tk, "tokenAddress"),
					getStr(tk, "feeShare"),
					getStr(tk, "apr"),
				)
			}
			t.Render(render.Out(), rt.styles)
			return nil
		},
	}
	c.Flags().StringVar(&chain, "chain", "", "filter by chain symbol (e.g. ETH)")
	c.Flags().StringVar(&tokenSym, "symbol", "", "filter by token symbol (e.g. USDT)")
	c.Flags().StringVar(&poolType, "type", "", "filter by pool type (swap|pool)")
	return c
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
