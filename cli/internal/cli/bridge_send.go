package cli

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"net/url"
	"os"
	"strings"
	"time"

	"github.com/spf13/cobra"
	"golang.org/x/term"

	"github.com/allbridge-io/rest-api/cli/internal/broadcast"
	"github.com/allbridge-io/rest-api/cli/internal/render"
	"github.com/allbridge-io/rest-api/cli/internal/sign"
	"github.com/allbridge-io/rest-api/cli/internal/wallet"
)

type bridgeSendResult struct {
	SourceChain      string             `json:"sourceChain"`
	DestinationChain string             `json:"destinationChain"`
	SourceToken      string             `json:"sourceToken"`
	DestinationToken string             `json:"destinationToken"`
	Amount           string             `json:"amount"`
	Sender           string             `json:"sender"`
	Recipient        string             `json:"recipient"`
	Messenger        string             `json:"messenger"`
	FeePaymentMethod string             `json:"feePaymentMethod"`
	ApproveTxHash    string             `json:"approveTxHash,omitempty"`
	TxHash           string             `json:"txHash,omitempty"`
	SignedTxHash     string             `json:"signedTxHash,omitempty"`
	Receipt          *broadcast.Receipt `json:"receipt,omitempty"`
	UnsignedTx       json.RawMessage    `json:"unsignedTx,omitempty"`
}

func newBridgeSendCmd() *cobra.Command {
	var (
		fromRef       string
		toRef         string
		amount        string
		sender        string
		recipient     string
		messenger     string
		feeMethod     string
		fee           string
		extraGas      string
		outputFmt     string
		walletName    string
		rpcURL        string
		chainID       int64
		gasLimit      uint64
		gasPrice      string
		dryRun        bool
		approve       bool
		approveAmount string
		approveWait   time.Duration
		skipChecks    bool
		api           string
		nextFeeToken  string
		nextRefundTo  string
	)
	c := &cobra.Command{
		Use:   "send",
		Short: "Build, sign and broadcast a bridge transaction",
		Long: `Builds an unsigned bridge transaction via /raw/bridge, signs it with a
local wallet, then broadcasts it through the source chain RPC.

When --approve is set, the CLI first calls /check/bridge/allowance and, if the
spender is not yet approved for the requested amount, it builds, signs and
broadcasts an approve transaction (via /raw/bridge/approve), waits for it to
be mined, and only then proceeds with the bridge transaction.

Native signing and broadcasting are currently implemented for EVM wallets only.
Use tx build/sign/broadcast directly for lower-level control.

Pass --api next to drive the Allbridge NEXT product. NEXT support is
currently dry-run only: the CLI fetches a route, calls /tx/create and
prints the unsigned transaction. Sign and broadcast it with your chain's
native tooling. Native sign+broadcast for NEXT will land in v0.2.x.`,
		RunE: func(cmd *cobra.Command, _ []string) error {
			rt, err := resolve(cmd)
			if err != nil {
				return err
			}
			kind, err := parseAPIKind(api)
			if err != nil {
				return err
			}
			if kind == apiNext {
				return runNextBridgeSend(cmd.Context(), rt, nextSendParams{
					fromRef:    fromRef,
					toRef:      toRef,
					amount:     amount,
					sender:     sender,
					recipient:  recipient,
					messenger:  messenger,
					feeTokenID: nextFeeToken,
					refundTo:   nextRefundTo,
					dryRun:     dryRun,
				})
			}
			if kind == apiBoth {
				return userErr("--api both is not supported for `bridge send` (it would broadcast twice); pick core or next explicitly")
			}
			if fromRef == "" || toRef == "" || amount == "" || recipient == "" || messenger == "" || feeMethod == "" {
				return userErr("--from, --to, --amount, --recipient, --messenger, --fee-method are required")
			}
			if !dryRun && outputFmt != "" && !strings.EqualFold(outputFmt, "json") {
				return userErrf("--output-format %s cannot be signed locally; use --dry-run or leave it as json", outputFmt)
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
			sourceChain := strings.ToUpper(getStr(src, "chainSymbol"))
			destinationChain := strings.ToUpper(getStr(dst, "chainSymbol"))

			var entry wallet.Entry
			if sender == "" || !dryRun {
				st, err := wallet.Load()
				if err != nil {
					return walletErr(err.Error())
				}
				if walletName == "" {
					walletName = rt.cfg.DefaultWallet
				}
				entry, err = st.Get(walletName)
				if err != nil {
					return walletErr(err.Error())
				}
				if sender == "" {
					sender = entry.Address
				}
				if !strings.EqualFold(sender, entry.Address) {
					return walletErrf("wallet address %s does not match --sender %s", entry.Address, sender)
				}
			}

			sp := render.NewSpinner()
			if !dryRun && !skipChecks {
				if !rt.flags.quiet {
					sp.Start("running pre-flight checks")
				}
				if err := runPreflight(cmd.Context(), rt, preflightParams{
					sourceChain:  sourceChain,
					sender:       sender,
					tokenAddress: getStr(src, "tokenAddress"),
					tokenSymbol:  getStr(src, "symbol"),
					amount:       amount,
					feeMethod:    strings.ToUpper(feeMethod),
					approve:      approve,
				}); err != nil {
					sp.Stop("")
					return err
				}
				sp.Stop(rt.styles.OK.Render("✓ pre-flight ok"))
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

			if !rt.flags.quiet {
				sp.Start("building bridge transaction")
			}
			var unsigned json.RawMessage
			if err := rt.client.Get(cmd.Context(), "/raw/bridge", q, &unsigned); err != nil {
				sp.Stop("")
				return netErr(err)
			}
			if dryRun {
				sp.Stop("")
				result := bridgeSendResult{
					SourceChain:      sourceChain,
					DestinationChain: destinationChain,
					SourceToken:      getStr(src, "tokenAddress"),
					DestinationToken: getStr(dst, "tokenAddress"),
					Amount:           amount,
					Sender:           sender,
					Recipient:        recipient,
					Messenger:        strings.ToUpper(messenger),
					FeePaymentMethod: strings.ToUpper(feeMethod),
					UnsignedTx:       unsigned,
				}
				if rt.format == render.FormatJSON || rt.format == render.FormatYAML {
					return render.Auto(render.Out(), rt.format, result)
				}
				renderBridgeDryRunResult(rt, result)
				return nil
			}

			sp.Stop("")
			if err := confirmSend(rt, sourceChain, destinationChain, amount, getStr(src, "symbol"), sender, recipient); err != nil {
				return err
			}

			passphrase, err := promptPassphrase(entry.Name)
			if err != nil {
				return walletErr(err.Error())
			}
			secret, err := wallet.Decrypt(entry, passphrase)
			if err != nil {
				return walletErr(err.Error())
			}
			defer zero(secret)

			signer, err := sign.For(entry.Family)
			if err != nil {
				return chainErr(err.Error())
			}
			caster, err := broadcast.For(entry.Family)
			if err != nil {
				return chainErr(err.Error())
			}

			rpc := rpcURL
			if rpc == "" {
				rpc = rt.cfg.RPC[sourceChain]
			}
			signOpts := sign.SignOptions{
				ChainID:     chainID,
				ChainSymbol: sourceChain,
				GasLimit:    gasLimit,
				GasPriceWei: gasPrice,
			}
			brOpts := broadcast.Options{RPCURL: rpc}

			var approveTxHash string
			if approve {
				if entry.Family != wallet.FamilyEVM && entry.Family != wallet.FamilyTron {
					return chainErr("--approve is supported on EVM and Tron only")
				}
				ah, err := runApproveFlow(cmd.Context(), rt, sp, signer, caster, secret, signOpts, brOpts, approveFlowParams{
					owner:         entry.Address,
					tokenAddress:  getStr(src, "tokenAddress"),
					amount:        amount,
					approveAmount: approveAmount,
					messenger:     strings.ToUpper(messenger),
					feeMethod:     strings.ToUpper(feeMethod),
					waitTimeout:   approveWait,
				})
				if err != nil {
					return err
				}
				approveTxHash = ah
			}

			if !rt.flags.quiet {
				sp.Start("signing transaction")
			}
			signed, err := signer.Sign(cmd.Context(), secret, unsigned, signOpts)
			if err != nil {
				sp.Stop("")
				return chainErr(err.Error())
			}
			if !rt.flags.quiet {
				sp.Update("broadcasting transaction")
			}
			receipt, err := caster.Broadcast(cmd.Context(), signed, brOpts)
			if err != nil {
				sp.Stop("")
				return chainErr(err.Error())
			}
			sp.Stop(rt.styles.OK.Render("sent " + receipt.Hash))

			result := bridgeSendResult{
				SourceChain:      sourceChain,
				DestinationChain: destinationChain,
				SourceToken:      getStr(src, "tokenAddress"),
				DestinationToken: getStr(dst, "tokenAddress"),
				Amount:           amount,
				Sender:           sender,
				Recipient:        recipient,
				Messenger:        strings.ToUpper(messenger),
				FeePaymentMethod: strings.ToUpper(feeMethod),
				ApproveTxHash:    approveTxHash,
				TxHash:           receipt.Hash,
				SignedTxHash:     signed.Hash,
				Receipt:          receipt,
			}
			if rt.format == render.FormatJSON || rt.format == render.FormatYAML {
				return render.Auto(render.Out(), rt.format, result)
			}
			renderBridgeSendResult(rt, result)
			return nil
		},
	}
	f := c.Flags()
	f.StringVar(&fromRef, "from", "", "source token ref CHAIN:SYMBOL_OR_ADDRESS")
	f.StringVar(&toRef, "to", "", "destination token ref")
	f.StringVar(&amount, "amount", "", "send amount in token precision")
	f.StringVar(&sender, "sender", "", "sender address; defaults to selected wallet address")
	f.StringVar(&recipient, "recipient", "", "recipient address on the destination chain")
	f.StringVar(&messenger, "messenger", "ALLBRIDGE", "messenger: ALLBRIDGE|WORMHOLE|CCTP|CCTP_V2|OFT|X_RESERVE")
	f.StringVar(&feeMethod, "fee-method", "WITH_NATIVE_CURRENCY", "WITH_NATIVE_CURRENCY|WITH_STABLECOIN|WITH_ABR")
	f.StringVar(&fee, "fee", "", "explicit fee amount in token precision")
	f.StringVar(&extraGas, "extra-gas", "", "extra gas amount in token precision")
	f.StringVar(&outputFmt, "output-format", "", "raw output format: json|base64|hex")
	f.StringVar(&walletName, "wallet", "", "wallet name (defaults to config.defaultWallet)")
	f.StringVar(&rpcURL, "rpc", "", "source chain RPC URL (otherwise config rpc.<chain>)")
	f.Int64Var(&chainID, "chain-id", 0, "EVM chain id override")
	f.Uint64Var(&gasLimit, "gas-limit", 0, "EVM gas limit override")
	f.StringVar(&gasPrice, "gas-price", "", "EVM gas price override in wei")
	f.BoolVar(&dryRun, "dry-run", false, "build and print the unsigned transaction without signing or broadcasting")
	f.BoolVar(&approve, "approve", false, "automatically approve the bridge contract for the source token before sending (EVM only)")
	f.StringVar(&approveAmount, "approve-amount", "", "approve this amount instead of the bridge amount; empty = unlimited")
	f.DurationVar(&approveWait, "approve-wait", 2*time.Minute, "max time to wait for the approve tx to be mined")
	f.BoolVar(&skipChecks, "skip-checks", false, "skip native/token balance + allowance pre-flight checks")
	f.StringVar(&api, "api", "core", "which API to drive: core|next (both is invalid for send)")
	f.StringVar(&nextFeeToken, "next-fee-token", "", "(--api next) relayer-fee tokenId; \"native\" picks chain native, empty defaults to native")
	f.StringVar(&nextRefundTo, "next-refund-to", "", "(--api next) refund address for NEAR Intents routes")
	return c
}

type approveFlowParams struct {
	owner         string
	tokenAddress  string
	amount        string // bridge amount, used both for the allowance check and the default approve amount
	approveAmount string // overrides amount for the approve tx; empty = unlimited
	messenger     string
	feeMethod     string
	waitTimeout   time.Duration
}

func runApproveFlow(
	ctx context.Context,
	rt *runtime,
	sp *render.Spinner,
	signer sign.Signer,
	caster broadcast.Broadcaster,
	secret []byte,
	signOpts sign.SignOptions,
	brOpts broadcast.Options,
	p approveFlowParams,
) (string, error) {
	if !rt.flags.quiet {
		sp.Start("checking bridge allowance")
	}
	q := url.Values{}
	q.Set("amount", p.amount)
	q.Set("ownerAddress", p.owner)
	q.Set("tokenAddress", p.tokenAddress)
	if p.feeMethod != "" {
		q.Set("feePaymentMethod", p.feeMethod)
	}
	var enough bool
	if err := rt.client.Get(ctx, "/check/bridge/allowance", q, &enough); err != nil {
		sp.Stop("")
		return "", netErr(err)
	}
	if enough {
		sp.Stop(rt.styles.OK.Render("✓ allowance sufficient — skipping approve"))
		return "", nil
	}

	if !rt.flags.quiet {
		sp.Update("building approve transaction")
	}
	aq := url.Values{}
	aq.Set("ownerAddress", p.owner)
	aq.Set("tokenAddress", p.tokenAddress)
	if p.approveAmount != "" {
		aq.Set("amount", p.approveAmount)
	} else if p.amount != "" {
		aq.Set("amount", p.amount)
	}
	if p.messenger != "" {
		aq.Set("messenger", p.messenger)
	}
	if p.feeMethod != "" {
		aq.Set("feePaymentMethod", p.feeMethod)
	}
	var unsigned json.RawMessage
	if err := rt.client.Get(ctx, "/raw/bridge/approve", aq, &unsigned); err != nil {
		sp.Stop("")
		return "", netErr(err)
	}

	if !rt.flags.quiet {
		sp.Update("signing approve transaction")
	}
	signed, err := signer.Sign(ctx, secret, unsigned, signOpts)
	if err != nil {
		sp.Stop("")
		return "", chainErr(err.Error())
	}

	if !rt.flags.quiet {
		sp.Update("broadcasting approve transaction")
	}
	receipt, err := caster.Broadcast(ctx, signed, brOpts)
	if err != nil {
		sp.Stop("")
		return "", chainErr(err.Error())
	}

	if !rt.flags.quiet {
		sp.Update(fmt.Sprintf("waiting for approve receipt (%s)", short(receipt.Hash)))
	}
	if err := caster.WaitForReceipt(ctx, receipt.Hash, brOpts, p.waitTimeout); err != nil {
		sp.Stop("")
		return "", chainErr(err.Error())
	}
	sp.Stop(rt.styles.OK.Render("✓ approve mined ") + receipt.Hash)
	return receipt.Hash, nil
}

func short(s string) string {
	if len(s) <= 14 {
		return s
	}
	return s[:8] + "…" + s[len(s)-6:]
}

type preflightParams struct {
	sourceChain  string
	sender       string
	tokenAddress string
	tokenSymbol  string
	amount       string
	feeMethod    string
	approve      bool
}

func runPreflight(ctx context.Context, rt *runtime, p preflightParams) error {
	if bal, err := fetchTokenBalance(ctx, rt, p.sender, p.tokenAddress); err == nil && bal != "" && p.amount != "" {
		if cmpDecimalStrings(bal, p.amount) < 0 {
			return userErrf("insufficient %s balance: have %s, need %s (base units)", p.tokenSymbol, bal, p.amount)
		}
	}
	if !p.approve {
		q := url.Values{}
		q.Set("amount", p.amount)
		q.Set("ownerAddress", p.sender)
		q.Set("tokenAddress", p.tokenAddress)
		if p.feeMethod != "" {
			q.Set("feePaymentMethod", p.feeMethod)
		}
		var enough bool
		if err := rt.client.Get(ctx, "/check/bridge/allowance", q, &enough); err == nil && !enough {
			return userErrf("bridge contract allowance for %s is below %s; rerun with --approve", p.tokenSymbol, p.amount)
		}
	}
	if nat, err := fetchNative(ctx, rt, p.sourceChain, p.sender); err == nil && nat != nil {
		if nat.Int == "0" || nat.Int == "" {
			fprintln(render.Err(), rt.styles.Warn.Render("⚠ native balance on "+p.sourceChain+" is zero; you may not be able to pay gas"))
		}
	}
	return nil
}

func cmpDecimalStrings(a, b string) int {
	a = strings.TrimLeft(a, "0")
	b = strings.TrimLeft(b, "0")
	if a == "" {
		a = "0"
	}
	if b == "" {
		b = "0"
	}
	if len(a) != len(b) {
		if len(a) < len(b) {
			return -1
		}
		return 1
	}
	if a < b {
		return -1
	}
	if a > b {
		return 1
	}
	return 0
}

func confirmSend(rt *runtime, sourceChain, destinationChain, amount, symbol, sender, recipient string) error {
	if rt.flags.yes {
		return nil
	}
	if !term.IsTerminal(int(os.Stdin.Fd())) {
		return userErr("refusing to broadcast without confirmation; pass --yes in non-interactive mode")
	}
	fmt.Fprintf(os.Stderr, "send %s %s from %s to %s (%s -> %s)? [y/N] ", amount, symbol, sender, recipient, sourceChain, destinationChain)
	line, err := bufio.NewReader(os.Stdin).ReadString('\n')
	if err != nil {
		return userErrf("read confirmation: %v", err)
	}
	switch strings.ToLower(strings.TrimSpace(line)) {
	case "y", "yes":
		return nil
	default:
		return userErr("cancelled")
	}
}

func renderBridgeSendResult(rt *runtime, r bridgeSendResult) {
	out := render.Out()
	s := rt.styles
	fprintln(out, s.Header.Render("BRIDGE SENT"))
	if r.ApproveTxHash != "" {
		kv(out, s, "approveTxHash", r.ApproveTxHash)
	}
	kv(out, s, "txHash", r.TxHash)
	kv(out, s, "route", r.SourceChain+" -> "+r.DestinationChain)
	kv(out, s, "amount", r.Amount)
	kv(out, s, "sender", r.Sender)
	kv(out, s, "recipient", r.Recipient)
	kv(out, s, "messenger", r.Messenger)
	kv(out, s, "feeMethod", r.FeePaymentMethod)
}

func renderBridgeDryRunResult(rt *runtime, r bridgeSendResult) {
	out := render.Out()
	s := rt.styles
	fprintln(out, s.Header.Render("BRIDGE TX BUILT"))
	kv(out, s, "route", r.SourceChain+" -> "+r.DestinationChain)
	kv(out, s, "amount", r.Amount)
	kv(out, s, "sender", r.Sender)
	kv(out, s, "recipient", r.Recipient)
	kv(out, s, "messenger", r.Messenger)
	kv(out, s, "feeMethod", r.FeePaymentMethod)
	fprintln(out, "")
	_ = render.JSON(out, r.UnsignedTx)
}
