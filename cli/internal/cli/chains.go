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

func newChainsCmd() *cobra.Command {
	c := &cobra.Command{
		Use:   "chains",
		Short: "Inspect supported chains",
	}
	c.AddCommand(newChainsListCmd(), newChainsShowCmd())
	return c
}

func newChainsListCmd() *cobra.Command {
	var chainType string
	c := &cobra.Command{
		Use:   "ls",
		Short: "List all supported chains",
		Args:  cobra.NoArgs,
		RunE: func(cmd *cobra.Command, _ []string) error {
			rt, err := resolve(cmd)
			if err != nil {
				return err
			}
			chains, err := fetchChains(cmd.Context(), rt, chainType)
			if err != nil {
				return netErr(err)
			}
			if rt.format == render.FormatJSON || rt.format == render.FormatYAML {
				return render.Auto(render.Out(), rt.format, chains)
			}
			t := render.NewTable("symbol", "name", "type", "chainId", "tokens")
			keys := sortedKeys(chains)
			for _, k := range keys {
				ch := chains[k]
				t.Append(k, getStr(ch, "name"), getStr(ch, "chainType"), getStr(ch, "chainId"), tokenCount(ch))
			}
			t.Render(render.Out(), rt.styles)
			return nil
		},
	}
	c.Flags().StringVar(&chainType, "type", "", "filter by pool type (swap|pool)")
	return c
}

func newChainsShowCmd() *cobra.Command {
	c := &cobra.Command{
		Use:   "show <symbol>",
		Short: "Show details for a single chain",
		Args:  cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			rt, err := resolve(cmd)
			if err != nil {
				return err
			}
			chains, err := fetchChains(cmd.Context(), rt, "")
			if err != nil {
				return netErr(err)
			}
			sym := strings.ToUpper(args[0])
			ch, ok := chains[sym]
			if !ok {
				return userErrf("chain %q not found; try `allbridge chains ls`", sym)
			}
			if rt.format == render.FormatJSON || rt.format == render.FormatYAML {
				return render.Auto(render.Out(), rt.format, ch)
			}
			s := rt.styles
			out := render.Out()
			fprintln(out, s.Header.Render("CHAIN  ")+sym)
			kv(out, s, "name", getStr(ch, "name"))
			kv(out, s, "type", getStr(ch, "chainType"))
			kv(out, s, "chainId", getStr(ch, "chainId"))
			tokens, _ := ch["tokens"].([]any)
			kv(out, s, "tokens", itoa(len(tokens)))
			if len(tokens) > 0 {
				fprintln(out, "")
				tt := render.NewTable("symbol", "decimals", "address", "pool")
				for _, raw := range tokens {
					tk, _ := raw.(map[string]any)
					tt.Append(getStr(tk, "symbol"), getStr(tk, "decimals"), getStr(tk, "tokenAddress"), getStr(tk, "poolAddress"))
				}
				tt.Render(out, s)
			}
			return nil
		},
	}
	return c
}

func fetchChains(ctx context.Context, rt *runtime, chainType string) (map[string]map[string]any, error) {
	q := url.Values{}
	if chainType != "" {
		q.Set("type", chainType)
	}
	var raw json.RawMessage
	if err := rt.client.Get(ctx, "/chains", q, &raw); err != nil {
		return nil, err
	}
	var out map[string]map[string]any
	if err := json.Unmarshal(raw, &out); err != nil {
		return nil, err
	}
	return out, nil
}

func sortedKeys(m map[string]map[string]any) []string {
	keys := make([]string, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	return keys
}

func tokenCount(ch map[string]any) int {
	if t, ok := ch["tokens"].([]any); ok {
		return len(t)
	}
	return 0
}
