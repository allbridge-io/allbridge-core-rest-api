package cli

import (
	"encoding/json"
	"net/url"

	"github.com/spf13/cobra"

	"github.com/allbridge-io/rest-api/cli/internal/render"
)

func newStellarCmd() *cobra.Command {
	c := &cobra.Command{
		Use:   "stellar",
		Short: "Stellar-specific helpers (trustlines)",
	}
	c.AddCommand(newStellarTrustlineCmd())
	return c
}

func newStellarTrustlineCmd() *cobra.Command {
	c := &cobra.Command{
		Use:   "trustline",
		Short: "Inspect / build trustlines",
	}

	var owner, tokenAddr string

	check := &cobra.Command{
		Use:   "check",
		Short: "Check whether a Stellar account has a trustline for a token",
		RunE: func(cmd *cobra.Command, _ []string) error {
			rt, err := resolve(cmd)
			if err != nil {
				return err
			}
			if owner == "" || tokenAddr == "" {
				return userErr("--owner and --token are required")
			}
			q := url.Values{}
			q.Set("ownerAddress", owner)
			q.Set("tokenAddress", tokenAddr)
			var raw json.RawMessage
			if err := rt.client.Get(cmd.Context(), "/check/stellar/balanceline", q, &raw); err != nil {
				return netErr(err)
			}
			return render.JSON(render.Out(), raw)
		},
	}
	check.Flags().StringVar(&owner, "owner", "", "Stellar account address")
	check.Flags().StringVar(&tokenAddr, "token", "", "token / asset address")

	add := &cobra.Command{
		Use:   "add",
		Short: "Build an unsigned trustline-add tx (/raw/stellar/trustline)",
		RunE: func(cmd *cobra.Command, _ []string) error {
			rt, err := resolve(cmd)
			if err != nil {
				return err
			}
			if owner == "" || tokenAddr == "" {
				return userErr("--owner and --token are required")
			}
			q := url.Values{}
			q.Set("ownerAddress", owner)
			q.Set("tokenAddress", tokenAddr)
			return runBuild(cmd.Context(), rt, "/raw/stellar/trustline", q)
		},
	}
	add.Flags().StringVar(&owner, "owner", "", "Stellar account address")
	add.Flags().StringVar(&tokenAddr, "token", "", "token / asset address")

	c.AddCommand(check, add)
	return c
}
