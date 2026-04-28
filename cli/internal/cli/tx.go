package cli

import (
	"context"
	"encoding/json"
	"net/url"
	"strings"

	"github.com/spf13/cobra"

	"github.com/allbridge-io/rest-api/cli/internal/render"
)

func newTxCmd() *cobra.Command {
	c := &cobra.Command{
		Use:   "tx",
		Short: "Low-level transaction build / sign / broadcast (any chain)",
		Long: `Atomic transaction lifecycle. Use this when you want to bring your own
signer (any chain) or when ` + "`bridge send`" + ` does not apply because the
source chain has no native signer in the CLI.

    tx build       fetch an unsigned tx from /raw/* (bridge / approve / swap / ...)
    tx sign        sign with the local encrypted keystore (EVM, Solana, Tron)
    tx broadcast   submit a signed tx to the chain RPC

The build → sign → broadcast pipeline is composable via UNIX pipes. Mix and
match: build with the CLI, sign with cast/solana-cli/stellar-cli, broadcast
with the CLI.`,
		Example: `  # Compose with stellar CLI (no native signer in allbridge for Stellar)
  allbridge tx build bridge --from STLR:USDC --to ETH:USDC --amount 100 \
                            --sender G... --recipient 0x... \
                            --output-format xdr > unsigned.xdr
  stellar tx sign unsigned.xdr --secret-key-name main > signed.xdr
  allbridge tx broadcast --chain STLR --in signed.xdr

  # Build a token approve tx separately from the bridge tx
  allbridge tx build approve --owner 0xYou --spender 0xPool --token 0xUSDT --chain ETH
  allbridge tx sign --in -          # reads from stdin
  allbridge tx broadcast --in - --chain ETH`,
	}
	c.AddCommand(newTxBuildCmd(), newTxSignCmd(), newTxBroadcastCmd())
	return c
}

func newTxBuildCmd() *cobra.Command {
	c := &cobra.Command{
		Use:   "build",
		Short: "Build an unsigned transaction via /raw/*",
	}
	c.AddCommand(
		newTxBuildBridgeCmd(),
		newTxBuildApproveCmd(),
		newTxBuildSwapCmd(),
		newTxBuildClaimCmd(),
		newTxBuildDepositCmd(),
		newTxBuildWithdrawCmd(),
	)
	return c
}

func newTxBuildBridgeCmd() *cobra.Command {
	var (
		fromRef, toRef string
		amount         string
		sender         string
		recipient      string
		messenger      string
		feeMethod      string
		fee            string
		extraGas       string
		outputFmt      string
	)
	c := &cobra.Command{
		Use:   "bridge",
		Short: "Build an unsigned bridge tx (/raw/bridge)",
		RunE: func(cmd *cobra.Command, _ []string) error {
			rt, err := resolve(cmd)
			if err != nil {
				return err
			}
			if fromRef == "" || toRef == "" || amount == "" || sender == "" || recipient == "" || messenger == "" || feeMethod == "" {
				return userErr("--from, --to, --amount, --sender, --recipient, --messenger, --fee-method are required")
			}
			tokens, err := fetchTokens(cmd.Context(), rt, "")
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
			q.Set("sender", sender)
			q.Set("recipient", recipient)
			q.Set("sourceToken", getStr(src, "tokenAddress"))
			q.Set("destinationToken", getStr(dst, "tokenAddress"))
			q.Set("messenger", strings.ToUpper(messenger))
			q.Set("feePaymentMethod", strings.ToUpper(feeMethod))
			if fee != "" {
				q.Set("fee", fee)
			}
			if extraGas != "" {
				q.Set("extraGas", extraGas)
			}
			if outputFmt != "" {
				q.Set("outputFormat", outputFmt)
			}
			return runBuild(cmd.Context(), rt, "/raw/bridge", q)
		},
	}
	f := c.Flags()
	f.StringVar(&fromRef, "from", "", "source token ref CHAIN:SYMBOL_OR_ADDRESS")
	f.StringVar(&toRef, "to", "", "destination token ref")
	f.StringVar(&amount, "amount", "", "send amount (token precision)")
	f.StringVar(&sender, "sender", "", "sender address on the source chain")
	f.StringVar(&recipient, "recipient", "", "recipient address on the destination chain")
	f.StringVar(&messenger, "messenger", "ALLBRIDGE", "messenger: ALLBRIDGE|WORMHOLE|CCTP|CCTP_V2|OFT|X_RESERVE")
	f.StringVar(&feeMethod, "fee-method", "WITH_NATIVE_CURRENCY", "WITH_NATIVE_CURRENCY|WITH_STABLECOIN|WITH_ABR")
	f.StringVar(&fee, "fee", "", "explicit fee amount (overrides auto)")
	f.StringVar(&extraGas, "extra-gas", "", "extra gas amount in source token")
	f.StringVar(&outputFmt, "output-format", "", "raw output format: json|base64|hex")
	return c
}

func newTxBuildApproveCmd() *cobra.Command {
	var (
		owner, spender, tokenAddr, chain, amount string
	)
	c := &cobra.Command{
		Use:   "approve",
		Short: "Build an unsigned approve tx (/raw/approve)",
		RunE: func(cmd *cobra.Command, _ []string) error {
			rt, err := resolve(cmd)
			if err != nil {
				return err
			}
			if owner == "" || spender == "" || tokenAddr == "" || chain == "" {
				return userErr("--owner, --spender, --token, --chain required")
			}
			q := url.Values{}
			q.Set("owner", owner)
			q.Set("spender", spender)
			q.Set("tokenAddress", tokenAddr)
			q.Set("chainSymbol", strings.ToUpper(chain))
			if amount != "" {
				q.Set("amount", amount)
			}
			return runBuild(cmd.Context(), rt, "/raw/approve", q)
		},
	}
	f := c.Flags()
	f.StringVar(&owner, "owner", "", "owner address")
	f.StringVar(&spender, "spender", "", "spender address")
	f.StringVar(&tokenAddr, "token", "", "token contract address")
	f.StringVar(&chain, "chain", "", "chain symbol")
	f.StringVar(&amount, "amount", "", "approve amount (token precision); empty = max")
	return c
}

func newTxBuildSwapCmd() *cobra.Command {
	var fromRef, toRef, amount, sender, recipient string
	c := &cobra.Command{
		Use:   "swap",
		Short: "Build an unsigned same-chain swap tx (/raw/swap)",
		RunE: func(cmd *cobra.Command, _ []string) error {
			rt, err := resolve(cmd)
			if err != nil {
				return err
			}
			if fromRef == "" || toRef == "" || amount == "" || sender == "" || recipient == "" {
				return userErr("--from, --to, --amount, --sender, --recipient required")
			}
			tokens, err := fetchTokens(cmd.Context(), rt, "")
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
			q.Set("sender", sender)
			q.Set("recipient", recipient)
			q.Set("sourceToken", getStr(src, "tokenAddress"))
			q.Set("destinationToken", getStr(dst, "tokenAddress"))
			return runBuild(cmd.Context(), rt, "/raw/swap", q)
		},
	}
	f := c.Flags()
	f.StringVar(&fromRef, "from", "", "source token ref")
	f.StringVar(&toRef, "to", "", "destination token ref")
	f.StringVar(&amount, "amount", "", "amount (token precision)")
	f.StringVar(&sender, "sender", "", "sender address")
	f.StringVar(&recipient, "recipient", "", "recipient address (defaults to sender)")
	return c
}

func newTxBuildClaimCmd() *cobra.Command {
	var owner, chain, txId string
	c := &cobra.Command{
		Use:   "claim",
		Short: "Build a claim tx for a pending transfer (/raw/claim)",
		RunE: func(cmd *cobra.Command, _ []string) error {
			rt, err := resolve(cmd)
			if err != nil {
				return err
			}
			if owner == "" || chain == "" || txId == "" {
				return userErr("--owner, --chain, --tx required")
			}
			q := url.Values{}
			q.Set("owner", owner)
			q.Set("chainSymbol", strings.ToUpper(chain))
			q.Set("txId", txId)
			return runBuild(cmd.Context(), rt, "/raw/claim", q)
		},
	}
	f := c.Flags()
	f.StringVar(&owner, "owner", "", "claimer address")
	f.StringVar(&chain, "chain", "", "destination chain symbol")
	f.StringVar(&txId, "tx", "", "source tx id")
	return c
}

func newTxBuildDepositCmd() *cobra.Command {
	var owner, chain, tokenAddr, amount string
	c := &cobra.Command{
		Use:   "deposit",
		Short: "Build a liquidity-pool deposit tx (/raw/deposit)",
		RunE: func(cmd *cobra.Command, _ []string) error {
			rt, err := resolve(cmd)
			if err != nil {
				return err
			}
			if owner == "" || chain == "" || tokenAddr == "" || amount == "" {
				return userErr("--owner, --chain, --token, --amount required")
			}
			q := url.Values{}
			q.Set("owner", owner)
			q.Set("chainSymbol", strings.ToUpper(chain))
			q.Set("tokenAddress", tokenAddr)
			q.Set("amount", amount)
			return runBuild(cmd.Context(), rt, "/raw/deposit", q)
		},
	}
	f := c.Flags()
	f.StringVar(&owner, "owner", "", "owner address")
	f.StringVar(&chain, "chain", "", "chain symbol")
	f.StringVar(&tokenAddr, "token", "", "token address")
	f.StringVar(&amount, "amount", "", "deposit amount")
	return c
}

func newTxBuildWithdrawCmd() *cobra.Command {
	var owner, chain, tokenAddr, amount string
	c := &cobra.Command{
		Use:   "withdraw",
		Short: "Build a liquidity-pool withdraw tx (/raw/withdraw)",
		RunE: func(cmd *cobra.Command, _ []string) error {
			rt, err := resolve(cmd)
			if err != nil {
				return err
			}
			if owner == "" || chain == "" || tokenAddr == "" || amount == "" {
				return userErr("--owner, --chain, --token, --amount required")
			}
			q := url.Values{}
			q.Set("owner", owner)
			q.Set("chainSymbol", strings.ToUpper(chain))
			q.Set("tokenAddress", tokenAddr)
			q.Set("amount", amount)
			return runBuild(cmd.Context(), rt, "/raw/withdraw", q)
		},
	}
	f := c.Flags()
	f.StringVar(&owner, "owner", "", "owner address")
	f.StringVar(&chain, "chain", "", "chain symbol")
	f.StringVar(&tokenAddr, "token", "", "token address")
	f.StringVar(&amount, "amount", "", "withdraw amount")
	return c
}

func runBuild(ctx context.Context, rt *runtime, path string, q url.Values) error {
	var raw json.RawMessage
	if err := rt.client.Get(ctx, path, q, &raw); err != nil {
		return netErr(err)
	}
	return render.JSON(render.Out(), raw)
}
