package cli

import (
	"context"
	"encoding/json"
	"net/url"
	"strings"

	"github.com/spf13/cobra"

	"github.com/allbridge-io/rest-api/cli/internal/render"
)

func newBalanceCmd() *cobra.Command {
	var (
		chain    string
		address  string
		tokenSym string
	)
	c := &cobra.Command{
		Use:   "balance",
		Short: "Show native + Allbridge-token balances for an address on a chain",
		Args:  cobra.NoArgs,
		RunE: func(cmd *cobra.Command, _ []string) error {
			rt, err := resolve(cmd)
			if err != nil {
				return err
			}
			if chain == "" || address == "" {
				return userErr("--chain and --address are required")
			}
			chainU := strings.ToUpper(chain)

			tokens, err := fetchTokens(cmd.Context(), rt, "")
			if err != nil {
				return netErr(err)
			}
			tokens = filterTokens(tokens, chainU, tokenSym)

			result := struct {
				Chain   string           `json:"chain"`
				Address string           `json:"address"`
				Native  *amountFormatted `json:"native,omitempty"`
				Tokens  []balanceRow     `json:"tokens"`
				Gas     map[string]any   `json:"gas,omitempty"`
			}{Chain: chainU, Address: address}

			if nat, err := fetchNative(cmd.Context(), rt, chainU, address); err == nil {
				result.Native = nat
			}
			if gas, err := fetchGasBalance(cmd.Context(), rt, chainU, address); err == nil {
				result.Gas = gas
			}

			for _, tk := range tokens {
				row := balanceRow{
					Symbol:   getStr(tk, "symbol"),
					Address:  getStr(tk, "tokenAddress"),
					Decimals: getStr(tk, "decimals"),
				}
				if bal, err := fetchTokenBalance(cmd.Context(), rt, address, getStr(tk, "tokenAddress")); err == nil {
					row.RawBalance = bal
				}
				result.Tokens = append(result.Tokens, row)
			}

			if rt.format == render.FormatJSON || rt.format == render.FormatYAML {
				return render.Auto(render.Out(), rt.format, result)
			}

			s := rt.styles
			out := render.Out()
			fprintln(out, s.Header.Render("BALANCE  "), chainU, s.Muted.Render("·"), address)
			if result.Native != nil {
				kv(out, s, "native", result.Native.Float+" ("+result.Native.Int+" base units)")
			}
			fprintln(out, "")
			t := render.NewTable("symbol", "balance (base)", "decimals", "address")
			for _, r := range result.Tokens {
				t.Append(r.Symbol, r.RawBalance, r.Decimals, r.Address)
			}
			t.Render(out, s)
			return nil
		},
	}
	f := c.Flags()
	f.StringVar(&chain, "chain", "", "chain symbol (e.g. ETH, SOL)")
	f.StringVar(&address, "address", "", "owner address")
	f.StringVar(&tokenSym, "token", "", "filter to a single token symbol")
	return c
}

type amountFormatted struct {
	Int   string `json:"int"`
	Float string `json:"float"`
}

type balanceRow struct {
	Symbol     string `json:"symbol"`
	Address    string `json:"address"`
	Decimals   string `json:"decimals"`
	RawBalance string `json:"balance"`
}

func fetchTokenBalance(ctx context.Context, rt *runtime, address, tokenAddr string) (string, error) {
	q := url.Values{}
	q.Set("address", address)
	q.Set("token", tokenAddr)
	var resp struct {
		Result string `json:"result"`
	}
	if err := rt.client.Get(ctx, "/token/balance", q, &resp); err != nil {
		return "", err
	}
	return resp.Result, nil
}

func fetchNative(ctx context.Context, rt *runtime, chain, address string) (*amountFormatted, error) {
	q := url.Values{}
	q.Set("chain", chain)
	q.Set("address", address)
	var out amountFormatted
	if err := rt.client.Get(ctx, "/token/native/balance", q, &out); err != nil {
		return nil, err
	}
	return &out, nil
}

func fetchGasBalance(ctx context.Context, rt *runtime, chain, address string) (map[string]any, error) {
	q := url.Values{}
	q.Set("chain", chain)
	q.Set("address", address)
	var raw json.RawMessage
	if err := rt.client.Get(ctx, "/gas/balance", q, &raw); err != nil {
		return nil, err
	}
	var m map[string]any
	if err := json.Unmarshal(raw, &m); err != nil {
		return nil, err
	}
	return m, nil
}
