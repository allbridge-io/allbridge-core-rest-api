package cli

import (
	"bufio"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"os"
	"strings"
	"sync"

	solanago "github.com/gagliardetto/solana-go"
	"github.com/mr-tron/base58"
	"github.com/spf13/cobra"
	"golang.org/x/term"

	"github.com/allbridge-io/rest-api/cli/internal/render"
	"github.com/allbridge-io/rest-api/cli/internal/wallet"
)

func newWalletCmd() *cobra.Command {
	c := &cobra.Command{
		Use:   "wallet",
		Short: "Manage local encrypted wallets (scrypt + AES-GCM)",
		Long: `Wallets are stored locally, encrypted with scrypt + AES-GCM. They never
leave your machine. Use --wallet <name> on signing-capable commands to
select a non-default wallet.

On-device key generation is supported for EVM, Solana and Tron (the three
families with native signers). For other families, generate the key with
your native tool and import it via ` + "`wallet import`" + `.`,
		Example: `  allbridge wallet add main      --family EVM --reveal
  allbridge wallet add main-sol  --family SOLANA --reveal
  allbridge wallet add main-trx  --family TRX
  allbridge wallet import legacy --family EVM --hex 0xabc...
  allbridge wallet import legacy-sol --family SOLANA --base58 5J3...
  allbridge wallet list
  allbridge wallet set-default main
  allbridge wallet show main`,
	}
	c.AddCommand(
		newWalletListCmd(),
		newWalletAddCmd(),
		newWalletImportCmd(),
		newWalletRemoveCmd(),
		newWalletSetDefaultCmd(),
		newWalletShowCmd(),
	)
	return c
}

func newWalletListCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "list",
		Short: "List stored wallets",
		Args:  cobra.NoArgs,
		RunE: func(cmd *cobra.Command, _ []string) error {
			rt, err := resolve(cmd)
			if err != nil {
				return err
			}
			st, err := wallet.Load()
			if err != nil {
				return walletErr(err.Error())
			}
			if rt.format == render.FormatJSON || rt.format == render.FormatYAML {
				return render.Auto(render.Out(), rt.format, st.Entries)
			}
			t := render.NewTable("name", "family", "address", "default")
			for _, n := range st.Names() {
				e := st.Entries[n]
				def := ""
				if n == st.Default {
					def = "✓"
				}
				t.Append(e.Name, string(e.Family), e.Address, def)
			}
			t.Render(render.Out(), rt.styles)
			return nil
		},
	}
}

func newWalletAddCmd() *cobra.Command {
	var (
		family string
		reveal bool
	)
	c := &cobra.Command{
		Use:   "add <name>",
		Short: "Generate a new wallet (EVM today; other families: use `wallet import`)",
		Long: `Generates a fresh secp256k1 keypair on-device, derives the address, encrypts
the secret with scrypt + AES-GCM and stores it in the local keystore. The
private key never leaves your machine.

Pass --reveal to print the private key once for offline backup. Without
--reveal you can recover the private key only by re-importing it from a
backup you saved yourself — the keystore stores the encrypted form only.`,
		Args: cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			name := args[0]
			fam, err := wallet.ParseFamily(family)
			if err != nil {
				return userErr(err.Error())
			}

			secret, addr, err := wallet.Generate(fam)
			if err != nil {
				return walletErr(err.Error())
			}
			defer zero(secret)

			passphrase, err := promptNewPassphrase()
			if err != nil {
				return walletErr(err.Error())
			}

			st, err := wallet.Load()
			if err != nil {
				return walletErr(err.Error())
			}
			if err := st.Add(name, fam, addr, secret, passphrase); err != nil {
				return walletErr(err.Error())
			}
			if err := st.Save(); err != nil {
				return walletErr(err.Error())
			}

			rt, _ := resolve(cmd)
			s := rt.styles
			out := render.Out()
			_, _ = fmt.Fprintln(out, s.OK.Render("✓ created"), name, "→", addr)
			_, _ = fmt.Fprintln(out, s.Muted.Render("encrypted with scrypt + AES-GCM at"), st.Path())
			if reveal {
				_, _ = fmt.Fprintln(out, "")
				_, _ = fmt.Fprintln(out, s.Warn.Render("⚠ private key (shown ONCE — save it now and never share):"))
				printSecretForFamily(out, fam, secret)
			} else {
				_, _ = fmt.Fprintln(out, s.Muted.Render("(rerun with --reveal to print the private key for offline backup)"))
			}
			return nil
		},
	}
	c.Flags().StringVar(&family, "family", "EVM", "wallet family: EVM, SOLANA, TRX, SRB, STLR, ALG, SUI, STX")
	c.Flags().BoolVar(&reveal, "reveal", false, "print the generated private key once for backup")
	return c
}

func printSecretForFamily(out io.Writer, fam wallet.Family, secret []byte) {
	switch fam {
	case wallet.FamilySolana:
		_, _ = fmt.Fprintln(out, base58.Encode(secret))
	default:
		_, _ = fmt.Fprintln(out, hex.EncodeToString(secret))
	}
}

func newWalletImportCmd() *cobra.Command {
	var (
		family        string
		fromHex       string
		fromBase58    string
		fromEnv       string
		fromEnvBase58 string
	)
	c := &cobra.Command{
		Use:   "import <name>",
		Short: "Import an existing private key into the keystore",
		Args:  cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			name := args[0]
			fam, err := wallet.ParseFamily(family)
			if err != nil {
				return userErr(err.Error())
			}

			var raw []byte
			switch {
			case fromHex != "":
				h := strings.TrimPrefix(strings.TrimSpace(fromHex), "0x")
				b, err := hex.DecodeString(h)
				if err != nil {
					return userErrf("invalid --hex value: %v", err)
				}
				raw = b
			case fromBase58 != "":
				b, err := decodeBase58Secret(fam, fromBase58, "--base58")
				if err != nil {
					return err
				}
				raw = b
			case fromEnv != "":
				v := os.Getenv(fromEnv)
				if v == "" {
					return userErrf("env var %q is empty", fromEnv)
				}
				h := strings.TrimPrefix(strings.TrimSpace(v), "0x")
				b, err := hex.DecodeString(h)
				if err != nil {
					return userErrf("invalid hex in $%s: %v", fromEnv, err)
				}
				raw = b
			case fromEnvBase58 != "":
				v := os.Getenv(fromEnvBase58)
				if v == "" {
					return userErrf("env var %q is empty", fromEnvBase58)
				}
				b, err := decodeBase58Secret(fam, v, "--from-env-base58")
				if err != nil {
					return err
				}
				raw = b
			default:
				prompt := []byte("private key (hex, no 0x): ")
				_, _ = os.Stderr.Write(prompt)
				h, err := readSecret()
				if err != nil {
					return walletErr(err.Error())
				}
				h = strings.TrimPrefix(strings.TrimSpace(h), "0x")
				b, err := hex.DecodeString(h)
				if err != nil {
					return userErrf("invalid hex private key: %v", err)
				}
				raw = b
			}

			addr, err := wallet.SecretToAddress(fam, raw)
			if err != nil {
				return walletErr(err.Error())
			}

			passphrase, err := promptNewPassphrase()
			if err != nil {
				return walletErr(err.Error())
			}

			st, err := wallet.Load()
			if err != nil {
				return walletErr(err.Error())
			}
			if err := st.Add(name, fam, addr, raw, passphrase); err != nil {
				return walletErr(err.Error())
			}
			if err := st.Save(); err != nil {
				return walletErr(err.Error())
			}
			rt, _ := resolve(cmd)
			_, _ = fmt.Fprintln(render.Out(), rt.styles.OK.Render("✓ imported"), name, "→", addr)
			return nil
		},
	}
	c.Flags().StringVar(&family, "family", "EVM", "wallet family")
	c.Flags().StringVar(&fromHex, "hex", "", "hex-encoded private key (DANGEROUS: visible in shell history)")
	c.Flags().StringVar(&fromBase58, "base58", "", "base58-encoded private key (SOLANA only; DANGEROUS: visible in shell history)")
	c.Flags().StringVar(&fromEnv, "from-env", "", "read hex private key from this env var")
	c.Flags().StringVar(&fromEnvBase58, "from-env-base58", "", "read base58 private key from this env var (SOLANA only)")
	return c
}

func decodeBase58Secret(fam wallet.Family, value string, flag string) ([]byte, error) {
	if fam != wallet.FamilySolana {
		return nil, userErrf("%s is only supported for SOLANA wallets", flag)
	}
	k, err := solanago.PrivateKeyFromBase58(strings.TrimSpace(value))
	if err != nil {
		return nil, userErrf("invalid base58 Solana private key: %v", err)
	}
	return []byte(k), nil
}

func newWalletRemoveCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "rm <name>",
		Short: "Remove a wallet from the keystore",
		Args:  cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			st, err := wallet.Load()
			if err != nil {
				return walletErr(err.Error())
			}
			if err := st.Remove(args[0]); err != nil {
				return walletErr(err.Error())
			}
			if err := st.Save(); err != nil {
				return walletErr(err.Error())
			}
			_, _ = fmt.Fprintln(render.Err(), "removed", args[0])
			return nil
		},
	}
}

func newWalletSetDefaultCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "set-default <name>",
		Short: "Mark a wallet as the default for signing",
		Args:  cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			st, err := wallet.Load()
			if err != nil {
				return walletErr(err.Error())
			}
			if err := st.SetDefault(args[0]); err != nil {
				return walletErr(err.Error())
			}
			return st.Save()
		},
	}
}

func newWalletShowCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "show <name>",
		Short: "Show wallet metadata (no secrets)",
		Args:  cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			rt, err := resolve(cmd)
			if err != nil {
				return err
			}
			st, err := wallet.Load()
			if err != nil {
				return walletErr(err.Error())
			}
			e, err := st.Get(args[0])
			if err != nil {
				return walletErr(err.Error())
			}
			if rt.format == render.FormatJSON || rt.format == render.FormatYAML {
				return render.Auto(render.Out(), rt.format, e)
			}
			s := rt.styles
			out := render.Out()
			fprintln(out, s.Header.Render("WALLET  "+e.Name))
			kv(out, s, "family", string(e.Family))
			kv(out, s, "address", e.Address)
			kv(out, s, "kdf", e.KDF)
			kv(out, s, "cipher", e.Cipher)
			kv(out, s, "createdAt", e.CreatedAt.Format("2006-01-02 15:04:05"))
			return nil
		},
	}
}

func promptNewPassphrase() (string, error) {
	fmt.Fprint(os.Stderr, "passphrase: ")
	a, err := readSecret()
	if err != nil {
		return "", err
	}
	fmt.Fprint(os.Stderr, "confirm: ")
	b, err := readSecret()
	if err != nil {
		return "", err
	}
	if a != b {
		return "", errors.New("passphrases do not match")
	}
	if len(a) < 8 {
		return "", errors.New("passphrase must be at least 8 chars")
	}
	return a, nil
}

// stdinReader is a process-wide buffered wrapper around os.Stdin so that
// successive readSecret() calls each consume exactly one line. The plain
// os.Stdin.Read variant gulps every byte available on a pipe in one go,
// which collapses two piped passphrase lines into a single answer and
// then EOFs the second prompt — see git log for the bug it fixed.
var (
	stdinReaderOnce sync.Once
	stdinReader     *bufio.Reader
)

func readSecret() (string, error) {
	fd := int(os.Stdin.Fd())
	if !term.IsTerminal(fd) {
		stdinReaderOnce.Do(func() { stdinReader = bufio.NewReader(os.Stdin) })
		line, err := stdinReader.ReadString('\n')
		if err != nil && line == "" {
			return "", err
		}
		return strings.TrimRight(line, "\r\n"), nil
	}
	pw, err := term.ReadPassword(fd)
	fmt.Fprintln(os.Stderr)
	if err != nil {
		return "", err
	}
	return string(pw), nil
}
