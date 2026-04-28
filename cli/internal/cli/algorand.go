package cli

import (
	"encoding/json"
	"net/url"

	"github.com/spf13/cobra"

	"github.com/allbridge-io/rest-api/cli/internal/render"
)

func newAlgorandCmd() *cobra.Command {
	c := &cobra.Command{
		Use:   "algorand",
		Short: "Algorand-specific helpers (opt-ins)",
	}
	c.AddCommand(newAlgorandOptinCmd())
	return c
}

func newAlgorandOptinCmd() *cobra.Command {
	c := &cobra.Command{
		Use:   "optin",
		Short: "Inspect / build ASA opt-ins",
	}

	var owner, tokenAddr string

	check := &cobra.Command{
		Use:   "check",
		Short: "Check whether an Algorand account is opted in to an ASA",
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
			if err := rt.client.Get(cmd.Context(), "/check/algorand/optin", q, &raw); err != nil {
				return netErr(err)
			}
			return render.JSON(render.Out(), raw)
		},
	}
	check.Flags().StringVar(&owner, "owner", "", "Algorand account address")
	check.Flags().StringVar(&tokenAddr, "token", "", "ASA / token address")

	add := &cobra.Command{
		Use:   "add",
		Short: "Build an unsigned opt-in tx (/raw/algorand/optin)",
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
			return runBuild(cmd.Context(), rt, "/raw/algorand/optin", q)
		},
	}
	add.Flags().StringVar(&owner, "owner", "", "Algorand account address")
	add.Flags().StringVar(&tokenAddr, "token", "", "ASA / token address")

	c.AddCommand(check, add)
	return c
}
