package cli

import (
	"encoding/json"
	"net/url"
	"strings"

	"github.com/spf13/cobra"

	"github.com/allbridge-io/rest-api/cli/internal/render"
)

type bridgePlanResult struct {
	SourceChain       string          `json:"sourceChain"`
	DestinationChain  string          `json:"destinationChain"`
	SourceToken       string          `json:"sourceToken"`
	DestinationToken  string          `json:"destinationToken"`
	SourceSymbol      string          `json:"sourceSymbol"`
	DestinationSymbol string          `json:"destinationSymbol"`
	Amount            string          `json:"amount"`
	Sender            string          `json:"sender,omitempty"`
	Recipient         string          `json:"recipient,omitempty"`
	Messenger         string          `json:"messenger"`
	FeePaymentMethod  string          `json:"feePaymentMethod"`
	Quote             json.RawMessage `json:"quote"`
	UnsignedTx        json.RawMessage `json:"unsignedTx,omitempty"`
}

func newBridgePlanCmd() *cobra.Command {
	var (
		fromRef   string
		toRef     string
		amount    string
		sender    string
		recipient string
		messenger string
		feeMethod string
		fee       string
		extraGas  string
	)
	c := &cobra.Command{
		Use:   "plan",
		Short: "Build a machine-readable bridge plan",
		Long: `Returns route metadata and quote JSON. When --sender and --recipient are
provided, it also includes the unsigned /raw/bridge transaction. It never signs
or broadcasts.`,
		RunE: func(cmd *cobra.Command, _ []string) error {
			rt, err := resolve(cmd)
			if err != nil {
				return err
			}
			if fromRef == "" || toRef == "" || amount == "" {
				return userErr("--from, --to, --amount are required")
			}
			if sender, err = resolveAddressRef(sender); err != nil {
				return err
			}
			if recipient, err = resolveAddressRef(recipient); err != nil {
				return err
			}
			if (sender == "") != (recipient == "") {
				return userErr("--sender and --recipient must be provided together")
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

			quoteQuery := url.Values{}
			quoteQuery.Set("amount", amount)
			quoteQuery.Set("sourceToken", getStr(src, "tokenAddress"))
			quoteQuery.Set("destinationToken", getStr(dst, "tokenAddress"))
			var quote json.RawMessage
			if err := rt.client.Get(cmd.Context(), "/bridge/quote", quoteQuery, &quote); err != nil {
				return netErr(err)
			}

			result := bridgePlanResult{
				SourceChain:       strings.ToUpper(getStr(src, "chainSymbol")),
				DestinationChain:  strings.ToUpper(getStr(dst, "chainSymbol")),
				SourceToken:       getStr(src, "tokenAddress"),
				DestinationToken:  getStr(dst, "tokenAddress"),
				SourceSymbol:      getStr(src, "symbol"),
				DestinationSymbol: getStr(dst, "symbol"),
				Amount:            amount,
				Sender:            sender,
				Recipient:         recipient,
				Messenger:         strings.ToUpper(messenger),
				FeePaymentMethod:  strings.ToUpper(feeMethod),
				Quote:             quote,
			}

			if sender != "" {
				rawQuery := url.Values{}
				rawQuery.Set("amount", amount)
				rawQuery.Set("sender", sender)
				rawQuery.Set("recipient", recipient)
				rawQuery.Set("sourceToken", result.SourceToken)
				rawQuery.Set("destinationToken", result.DestinationToken)
				rawQuery.Set("messenger", result.Messenger)
				rawQuery.Set("feePaymentMethod", result.FeePaymentMethod)
				if fee != "" {
					rawQuery.Set("fee", fee)
				}
				if extraGas != "" {
					rawQuery.Set("extraGas", extraGas)
				}
				var unsigned json.RawMessage
				if err := rt.client.Get(cmd.Context(), "/raw/bridge", rawQuery, &unsigned); err != nil {
					return netErr(err)
				}
				result.UnsignedTx = unsigned
			}

			if rt.format == render.FormatJSON || rt.format == render.FormatYAML {
				return render.Auto(render.Out(), rt.format, result)
			}
			renderBridgePlan(rt, result)
			return nil
		},
	}
	f := c.Flags()
	f.StringVar(&fromRef, "from", "", "source token ref CHAIN:SYMBOL_OR_ADDRESS")
	f.StringVar(&toRef, "to", "", "destination token ref")
	f.StringVar(&amount, "amount", "", "send amount in token precision")
	f.StringVar(&sender, "sender", "", "sender address; enables unsigned tx build when paired with --recipient")
	f.StringVar(&recipient, "recipient", "", "recipient address; enables unsigned tx build when paired with --sender")
	f.StringVar(&messenger, "messenger", "ALLBRIDGE", "messenger: ALLBRIDGE|WORMHOLE|CCTP|CCTP_V2|OFT|X_RESERVE")
	f.StringVar(&feeMethod, "fee-method", "WITH_NATIVE_CURRENCY", "WITH_NATIVE_CURRENCY|WITH_STABLECOIN|WITH_ABR")
	f.StringVar(&fee, "fee", "", "explicit fee amount in token precision for unsigned tx build")
	f.StringVar(&extraGas, "extra-gas", "", "extra gas amount in token precision for unsigned tx build")
	return c
}

func renderBridgePlan(rt *runtime, r bridgePlanResult) {
	out := render.Out()
	s := rt.styles
	fprintln(out, s.Header.Render("BRIDGE PLAN"))
	kv(out, s, "route", r.SourceChain+" "+r.SourceSymbol+" -> "+r.DestinationChain+" "+r.DestinationSymbol)
	kv(out, s, "amount", r.Amount)
	kv(out, s, "messenger", r.Messenger)
	kv(out, s, "feeMethod", r.FeePaymentMethod)
	if len(r.UnsignedTx) > 0 {
		kv(out, s, "unsignedTx", "included")
	}
}
