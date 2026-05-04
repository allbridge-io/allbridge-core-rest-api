package cli

import (
	"context"
	"encoding/json"
	"net/url"
	"strings"
	"time"

	"github.com/spf13/cobra"

	"github.com/allbridge-io/rest-api/cli/internal/next"
	"github.com/allbridge-io/rest-api/cli/internal/render"
)

func newTransfersCmd() *cobra.Command {
	c := &cobra.Command{
		Use:   "transfers",
		Short: "Inspect cross-chain transfers",
		Long: `Look up the delivery status of a cross-chain transfer by its source-side
tx hash. Pass --watch to poll until delivered or until --timeout elapses.

Default --api=core uses Allbridge Core's /transfer/status?chain=…&txId=…
(requires --chain). --api=next uses Allbridge NEXT's /transfer/status?tx=…
(no --chain needed; NEXT looks the chain up itself).`,
		Example: `  allbridge transfers status 0xabc... --chain ETH
  allbridge transfers status 0xabc... --chain ETH --watch --interval 5s
  allbridge transfers status 5pVpoyw... --api next --watch
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
		api      string
	)
	c := &cobra.Command{
		Use:   "status <txId>",
		Short: "Get the status of a transfer",
		Long:  "Polls /transfer/status (Core or NEXT) and pretty-prints the response.",
		Args:  cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			rt, err := resolve(cmd)
			if err != nil {
				return err
			}
			kind, err := parseAPIKind(api)
			if err != nil {
				return err
			}
			if kind == apiBoth {
				return userErr("--api both is not supported for transfers status; pick core or next")
			}

			if kind == apiNext {
				return runTransfersStatusNext(cmd.Context(), rt, args[0], watch, interval, timeout)
			}
			if chain == "" {
				return userErr("--chain is required for --api core (e.g. ETH, SOL, TRX)")
			}
			q := url.Values{}
			q.Set("chain", strings.ToUpper(chain))
			q.Set("txId", args[0])
			return runTransfersStatusCore(cmd, rt, args[0], q, watch, interval, timeout)
		},
	}
	c.Flags().StringVar(&chain, "chain", "", "source chain symbol (required for --api core)")
	c.Flags().BoolVar(&watch, "watch", false, "poll until the transfer is delivered or timeout elapses")
	c.Flags().DurationVar(&interval, "interval", 10*time.Second, "watch polling interval")
	c.Flags().DurationVar(&timeout, "timeout", 30*time.Minute, "watch timeout")
	c.Flags().StringVar(&api, "api", "core", "which API to query: core|next")
	return c
}

func runTransfersStatusCore(cmd *cobra.Command, rt *runtime, txID string, q url.Values, watch bool, interval, timeout time.Duration) error {
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
				return chainErrf("timed out waiting for transfer %s after %s", txID, timeout)
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
}

// runTransfersStatusNext polls NEXT's /transfer/status. NEXT responds with a
// `status` field (SUCCESS | PROCESSING | FAILED | REFUNDED); anything other
// than PROCESSING is terminal and stops the watch loop. NEXT also returns
// 404 for txs it hasn't indexed yet (newly broadcast), so we treat that as
// "still waiting" instead of hard-erroring during --watch.
func runTransfersStatusNext(ctx context.Context, rt *runtime, txID string, watch bool, interval, timeout time.Duration) error {
	st, err := fetchNextStatus(ctx, rt, txID)
	if watch {
		if err != nil && !isNextNotFound(err) {
			return netErr(err)
		}
		if st == nil || nextStatusInFlight(st.Status) {
			sp := render.NewSpinner()
			if !rt.flags.quiet {
				sp.Start("waiting for NEXT transfer delivery")
			}
			deadline := time.Now().Add(timeout)
			for {
				select {
				case <-ctx.Done():
					sp.Stop("")
					return chainErr(ctx.Err().Error())
				case <-time.After(interval):
				}
				st, err = fetchNextStatus(ctx, rt, txID)
				if err != nil && !isNextNotFound(err) {
					sp.Stop("")
					return netErr(err)
				}
				if st != nil && !nextStatusInFlight(st.Status) {
					sp.Stop(rt.styles.OK.Render(strings.ToLower(st.Status)))
					break
				}
				if time.Now().After(deadline) {
					sp.Stop("")
					return chainErrf("timed out waiting for NEXT transfer %s after %s", txID, timeout)
				}
				if !rt.flags.quiet {
					if st == nil {
						sp.Update("not yet indexed by NEXT")
					} else {
						sp.Update("status: " + strings.ToLower(st.Status))
					}
				}
			}
		}
	} else if err != nil {
		return netErr(err)
	}

	if st == nil {
		return userErrf("NEXT has no record of tx %s yet (try --watch to poll)", txID)
	}
	if rt.format == render.FormatJSON || rt.format == render.FormatYAML {
		return render.Auto(render.Out(), rt.format, st)
	}
	renderNextTransferStatus(rt, st)
	return nil
}

func fetchNextStatus(ctx context.Context, rt *runtime, txID string) (*next.TxStatus, error) {
	return rt.nextClient.TransferStatus(ctx, txID)
}

func isNextNotFound(err error) bool {
	if err == nil {
		return false
	}
	if e, ok := err.(*next.Error); ok {
		return e.Status == 404
	}
	return false
}

func nextStatusInFlight(s string) bool {
	switch strings.ToUpper(strings.TrimSpace(s)) {
	case "SUCCESS", "FAILED", "REFUNDED":
		return false
	}
	return true // PROCESSING, empty, anything unexpected
}

func renderNextTransferStatus(rt *runtime, st *next.TxStatus) {
	out := render.Out()
	s := rt.styles
	kv(out, s, "status", st.Status)
	kv(out, s, "from", st.SourceChain+":"+st.SourceTokenID)
	kv(out, s, "to", st.DestinationChain+":"+st.DestinationTokenID)
	if st.AmountInFormatted != "" {
		kv(out, s, "send", st.AmountInFormatted)
	} else {
		kv(out, s, "send", st.AmountIn)
	}
	if st.AmountOutFormatted != "" {
		kv(out, s, "receive", st.AmountOutFormatted)
	} else if st.AmountOut != "" {
		kv(out, s, "receive", st.AmountOut)
	}
	kv(out, s, "sender", st.Sender)
	kv(out, s, "recipient", st.Recipient)
	kv(out, s, "sendTx", st.SendTx.ID)
	if st.ReceiveTx != nil {
		kv(out, s, "receiveTx", st.ReceiveTx.ID)
		fprintln(out, s.OK.Render("✓ delivered"))
	} else {
		fprintln(out, s.Warn.Render("… still in flight"))
	}
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
