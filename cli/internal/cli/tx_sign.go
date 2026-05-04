package cli

import (
	"encoding/json"
	"fmt"
	"io"
	"os"
	"os/exec"
	"strings"

	"github.com/spf13/cobra"

	"github.com/allbridge-io/rest-api/cli/internal/broadcast"
	"github.com/allbridge-io/rest-api/cli/internal/render"
	"github.com/allbridge-io/rest-api/cli/internal/sign"
	"github.com/allbridge-io/rest-api/cli/internal/wallet"
)

func newTxSignCmd() *cobra.Command {
	var (
		walletName string
		fromFile   string
		chainSym   string
		chainIDInt int64
		gasLimit   uint64
		gasPrice   string
	)
	c := &cobra.Command{
		Use:   "sign",
		Short: "Sign an unsigned tx (read from stdin or --in)",
		Long: `Reads a JSON unsigned tx (as produced by ` + "`allbridge tx build ...`" + `) from
stdin or a file, signs it with the configured wallet, and prints the signed tx
as JSON to stdout.

Only EVM is implemented natively today. Other chain families fail explicitly
until their native signers are added.`,
		RunE: func(cmd *cobra.Command, _ []string) error {
			rt, err := resolve(cmd)
			if err != nil {
				return err
			}
			st, err := wallet.Load()
			if err != nil {
				return walletErr(err.Error())
			}
			if walletName == "" {
				walletName = rt.cfg.DefaultWallet
			}
			entry, err := st.Get(walletName)
			if err != nil {
				return walletErr(err.Error())
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

			raw, err := readUnsignedTx(fromFile)
			if err != nil {
				return userErr(err.Error())
			}

			signer, err := sign.For(entry.Family)
			if err != nil {
				return chainErr(err.Error())
			}
			res, err := signer.Sign(cmd.Context(), secret, raw, sign.SignOptions{
				ChainID:     chainIDInt,
				ChainSymbol: chainSym,
				GasLimit:    gasLimit,
				GasPriceWei: gasPrice,
			})
			if err != nil {
				return chainErr(err.Error())
			}
			return render.JSON(render.Out(), res)
		},
	}
	c.Flags().StringVar(&walletName, "wallet", "", "wallet name (defaults to config.defaultWallet)")
	c.Flags().StringVar(&fromFile, "in", "", "read unsigned tx JSON from this file (default: stdin)")
	c.Flags().StringVar(&chainSym, "chain", "", "chain symbol (informational)")
	c.Flags().Int64Var(&chainIDInt, "chain-id", 0, "EVM chain id (overrides tx.chainId)")
	c.Flags().Uint64Var(&gasLimit, "gas-limit", 0, "EVM gas limit override")
	c.Flags().StringVar(&gasPrice, "gas-price", "", "EVM gas price (wei) override")
	return c
}

func newTxBroadcastCmd() *cobra.Command {
	var (
		fromFile string
		chainSym string
		rpcURL   string
	)
	c := &cobra.Command{
		Use:   "broadcast",
		Short: "Broadcast a signed tx",
		Long:  "Reads a sign.Result JSON from stdin or --in and broadcasts it to the configured RPC.",
		RunE: func(cmd *cobra.Command, _ []string) error {
			rt, err := resolve(cmd)
			if err != nil {
				return err
			}
			raw, err := readBytes(fromFile)
			if err != nil {
				return userErr(err.Error())
			}
			var res sign.Result
			if err := json.Unmarshal(raw, &res); err != nil {
				return userErrf("decode signed tx: %v", err)
			}
			if chainSym != "" {
				res.ChainSymbol = strings.ToUpper(chainSym)
			}
			rpc := rpcURL
			if rpc == "" && res.ChainSymbol != "" {
				rpc = rt.cfg.RPC[res.ChainSymbol]
			}
			caster, err := broadcast.For(res.Family)
			if err != nil {
				return chainErr(err.Error())
			}
			receipt, err := caster.Broadcast(cmd.Context(), &res, broadcast.Options{RPCURL: rpc})
			if err != nil {
				return chainErr(err.Error())
			}
			return render.JSON(render.Out(), receipt)
		},
	}
	c.Flags().StringVar(&fromFile, "in", "", "read sign.Result JSON from this file (default: stdin)")
	c.Flags().StringVar(&chainSym, "chain", "", "override chain symbol")
	c.Flags().StringVar(&rpcURL, "rpc", "", "override RPC URL (otherwise pulled from config rpc.<chain>)")
	return c
}

func readUnsignedTx(path string) (json.RawMessage, error) {
	b, err := readBytes(path)
	if err != nil {
		return nil, err
	}
	trimmed := strings.TrimSpace(string(b))
	if !strings.HasPrefix(trimmed, "{") && !strings.HasPrefix(trimmed, "[") {
		return json.Marshal(trimmed)
	}
	return json.RawMessage(b), nil
}

func readBytes(path string) ([]byte, error) {
	if path == "" || path == "-" {
		return io.ReadAll(os.Stdin)
	}
	return os.ReadFile(path)
}

// promptPassphrase resolves the keystore passphrase from the highest-
// priority source available so the same binary works equally well at an
// interactive shell prompt and inside CI/cron pipelines.
//
// Resolution order (first match wins):
//
//	--passphrase-cmd <cmd>      shell command whose stdout is the passphrase
//	--passphrase-file <path>    file contents (trailing whitespace stripped)
//	$ALLBRIDGE_PASSPHRASE       env var
//	stdin (if not a TTY)        single line, useful for `echo $PASS | ...`
//	interactive prompt          fallback for human use
//
// Trailing newlines / carriage returns are stripped from every source so
// `echo "secret" > file` and `pass show name` both work without surprises.
func promptPassphrase(name string) (string, error) {
	if pp, ok, err := resolveNonInteractivePassphrase(); err != nil {
		return "", err
	} else if ok {
		return pp, nil
	}
	fmt.Fprintf(os.Stderr, "passphrase for %s: ", name)
	return readSecret()
}

// resolveNonInteractivePassphrase walks the cmd / file / env precedence
// chain and returns the first hit. ok=false means no non-interactive
// source was configured and the caller should prompt the user.
func resolveNonInteractivePassphrase() (string, bool, error) {
	if cmdLine := strings.TrimSpace(gflags.passphraseCmd); cmdLine != "" {
		out, err := exec.Command("sh", "-c", cmdLine).Output()
		if err != nil {
			return "", false, fmt.Errorf("--passphrase-cmd: %w", err)
		}
		return strings.TrimRight(string(out), "\r\n"), true, nil
	}
	if path := strings.TrimSpace(gflags.passphraseFile); path != "" {
		// Mode self-check: warn (don't fail — user might be on a
		// filesystem where mode bits are advisory, e.g. exFAT) if the
		// file is readable by group or other.
		if info, statErr := os.Stat(path); statErr == nil {
			if mode := info.Mode().Perm(); mode&0o077 != 0 {
				fmt.Fprintf(os.Stderr,
					"⚠ %s has mode %o; recommend `chmod 600 %s` (passphrase readable by other users)\n",
					path, mode, path)
			}
		}
		buf, err := os.ReadFile(path)
		if err != nil {
			return "", false, fmt.Errorf("--passphrase-file %s: %w", path, err)
		}
		return strings.TrimRight(string(buf), "\r\n"), true, nil
	}
	if v := os.Getenv("ALLBRIDGE_PASSPHRASE"); v != "" {
		// Unset immediately so we don't leak the secret to any child
		// process we later spawn (clipboard helpers, link openers,
		// `--passphrase-cmd` shell). The env entry would otherwise
		// stay readable through Go's os.Environ() and inherit by
		// default into every exec.Cmd.
		_ = os.Unsetenv("ALLBRIDGE_PASSPHRASE")
		return strings.TrimRight(v, "\r\n"), true, nil
	}
	return "", false, nil
}

func zero(b []byte) {
	for i := range b {
		b[i] = 0
	}
}
