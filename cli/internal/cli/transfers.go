package cli

import (
	"encoding/json"
	"net/url"
	"strings"
	"time"

	"github.com/spf13/cobra"

	"github.com/allbridge-io/rest-api/cli/internal/render"
)

func newTransfersCmd() *cobra.Command {
	c := &cobra.Command{
		Use:   "transfers",
		Short: "Inspect cross-chain transfers",
		Long: `Look up the delivery status of a cross-chain transfer by its source-side
tx hash. Pass --watch to poll until delivered or until --timeout elapses.`,
		Example: `  allbridge transfers status 0xabc... --chain ETH
  allbridge transfers status 0xabc... --chain ETH --watch --interval 5s
  allbridge transfers status 0xabc... --chain ETH --json | jq .receive`,
	}
	c.AddCommand(newTransfersStatusCmd())
	return c
}

func newTransfersStatusCmd() *cobra.Command {
	var (
		chain    string
		watch    bool
		interval time.Duration
		timeout  time.Duration
	)
	c := &cobra.Command{
		Use:   "status <txId>",
		Short: "Get the status of a transfer",
		Long:  "Calls GET /transfer/status?chain=...&txId=... and pretty-prints the response.",
		Args:  cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			rt, err := resolve(cmd)
			if err != nil {
				return err
			}
			if chain == "" {
				return userErr("--chain is required (e.g. ETH, SOL, TRX)")
			}
			q := url.Values{}
			q.Set("chain", strings.ToUpper(chain))
			q.Set("txId", args[0])

			raw, err := fetchTransferStatus(cmd, rt, q)
			if err != nil {
				return netErr(err)
			}
			if watch && !transferDelivered(raw) {
				sp := render.NewSpinner()
				if !rt.flags.quiet {
					sp.Start("waiting for transfer delivery")
				}
				deadline := time.Now().Add(timeout)
				for {
					select {
					case <-cmd.Context().Done():
						sp.Stop("")
						return chainErr(cmd.Context().Err().Error())
					case <-time.After(interval):
					}
					raw, err = fetchTransferStatus(cmd, rt, q)
					if err != nil {
						sp.Stop("")
						return netErr(err)
					}
					if transferDelivered(raw) {
						sp.Stop(rt.styles.OK.Render("delivered"))
						break
					}
					if time.Now().After(deadline) {
						sp.Stop("")
						return chainErrf("timed out waiting for transfer %s after %s", args[0], timeout)
					}
					if !rt.flags.quiet {
						sp.Update("waiting for transfer delivery")
					}
				}
			}
			if rt.format == render.FormatJSON || rt.format == render.FormatYAML {
				return render.Auto(render.Out(), rt.format, raw)
			}
			renderTransferStatus(rt, raw)
			return nil
		},
	}
	c.Flags().StringVar(&chain, "chain", "", "source chain symbol (required)")
	c.Flags().BoolVar(&watch, "watch", false, "poll until the transfer is delivered or timeout elapses")
	c.Flags().DurationVar(&interval, "interval", 10*time.Second, "watch polling interval")
	c.Flags().DurationVar(&timeout, "timeout", 30*time.Minute, "watch timeout")
	return c
}

func fetchTransferStatus(cmd *cobra.Command, rt *runtime, q url.Values) (json.RawMessage, error) {
	var raw json.RawMessage
	if err := rt.client.Get(cmd.Context(), "/transfer/status", q, &raw); err != nil {
		return nil, err
	}
	return raw, nil
}

func renderTransferStatus(rt *runtime, raw json.RawMessage) {
	var m map[string]any
	_ = json.Unmarshal(raw, &m)
	s := rt.styles
	out := render.Out()
	kv(out, s, "txId", getStr(m, "txId"))
	kv(out, s, "from", getStr(m, "sourceChainSymbol"))
	kv(out, s, "to", getStr(m, "destinationChainSymbol"))
	kv(out, s, "send", getStr(m, "sendAmountFormatted"))
	kv(out, s, "fee", getStr(m, "stableFeeFormatted"))
	kv(out, s, "sender", getStr(m, "senderAddress"))
	kv(out, s, "recipient", getStr(m, "recipientAddress"))
	kv(out, s, "sigs", getStr(m, "signaturesCount")+"/"+getStr(m, "signaturesNeeded"))
	if recv, ok := m["receive"].(map[string]any); ok {
		kv(out, s, "receivedTx", getStr(recv, "txId"))
		fprintln(out, s.OK.Render("✓ delivered"))
	} else {
		fprintln(out, s.Warn.Render("… still in flight"))
	}
}

func transferDelivered(raw json.RawMessage) bool {
	var m map[string]any
	if err := json.Unmarshal(raw, &m); err != nil {
		return false
	}
	recv, ok := m["receive"].(map[string]any)
	if !ok {
		return false
	}
	return getStr(recv, "txId") != ""
}
