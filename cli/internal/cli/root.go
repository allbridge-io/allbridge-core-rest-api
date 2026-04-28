package cli

import (
	"fmt"
	"os"
	"time"

	"github.com/spf13/cobra"
	"golang.org/x/term"

	"github.com/allbridge-io/rest-api/cli/internal/api"
	"github.com/allbridge-io/rest-api/cli/internal/config"
	"github.com/allbridge-io/rest-api/cli/internal/render"
	"github.com/allbridge-io/rest-api/cli/internal/version"
)

type globalFlags struct {
	output      string
	jsonOnly    bool
	noColor     bool
	verbose     bool
	quiet       bool
	configPath  string
	apiURLFlag  string
	networkFlag string
	yes         bool
}

type runtime struct {
	format render.Format
	styles render.Styles
	client *api.Client
	cfg    config.Config
	flags  *globalFlags
}

var gflags = &globalFlags{}

const (
	groupBridge  = "bridge"
	groupTx      = "tx"
	groupChain   = "chain"
	groupWallet  = "wallet"
	groupSession = "session"
)

func NewRootCmd() *cobra.Command {
	root := &cobra.Command{
		Use:   "allbridge",
		Short: "Power CLI for Allbridge Core",
		Long: `allbridge is a single-binary CLI for the Allbridge Core REST API.

Every subcommand is scriptable: pass --json (or -o yaml) for machine-readable
output, --yes to skip confirmation prompts, and rely on stable exit codes
(0 ok, 1 user, 2 network, 3 chain, 4 wallet).

Native signing & broadcasting are available for EVM and Solana already from the box.
Other chains use the detached flow:
build the unsigned tx with ` + "`tx build`" + `, sign with your native tool,
broadcast with ` + "`tx broadcast`" + `. See README for cookbooks.`,
		Example: `  # Inspect what's available
  allbridge chains ls
  allbridge tokens ls --chain ETH
  allbridge bridge routes --from ETH --to SOL

  # Quote and send a transfer (EVM/SOL, native signing)
  allbridge bridge quote --from ETH:USDT --to SOL:USDT --amount 100
  allbridge bridge send  --from ETH:USDT --to SOL:USDT --amount 100 \
                         --recipient 7xKX... --approve --yes
  allbridge transfers status 0xabc... --chain ETH --watch

  # Detached path (any chain)
  allbridge tx build bridge --from STLR:USDC --to ETH:USDC --amount 100 \
                            --sender G... --recipient 0x... > unsigned.xdr
  stellar tx sign unsigned.xdr --secret-key-name main > signed.xdr
  allbridge tx broadcast --chain STLR --in signed.xdr

  # Wallet management (encrypted local keystore: scrypt + AES-GCM)
  allbridge wallet add main --family EVM --reveal
  allbridge wallet list
  allbridge wallet set-default main

  # Scripting friendly
  allbridge bridge quote ... --json | jq '.options[0].fee'`,
		SilenceUsage:  true,
		SilenceErrors: true,
		Version:       version.String(),
		RunE: func(cmd *cobra.Command, _ []string) error {
			if term.IsTerminal(int(os.Stdout.Fd())) && !gflags.jsonOnly && gflags.output == "table" {
				return runTUI(cmd)
			}
			return cmd.Help()
		},
	}

	root.AddGroup(
		&cobra.Group{ID: groupBridge, Title: "Bridge flow:"},
		&cobra.Group{ID: groupTx, Title: "Transactions (detached / low-level):"},
		&cobra.Group{ID: groupChain, Title: "Chain helpers:"},
		&cobra.Group{ID: groupWallet, Title: "Wallets & configuration:"},
		&cobra.Group{ID: groupSession, Title: "Shell:"},
	)

	pf := root.PersistentFlags()
	pf.StringVarP(&gflags.output, "output", "o", "table", "output format: table|wide|json|yaml")
	pf.BoolVar(&gflags.jsonOnly, "json", false, "shorthand for --output json")
	pf.BoolVar(&gflags.noColor, "no-color", false, "disable ANSI colors")
	pf.BoolVarP(&gflags.verbose, "verbose", "v", false, "verbose progress output")
	pf.BoolVarP(&gflags.quiet, "quiet", "q", false, "suppress progress output")
	pf.StringVar(&gflags.configPath, "config", "", "override config file path")
	pf.StringVar(&gflags.apiURLFlag, "api-url", "", "override API base URL")
	pf.StringVar(&gflags.networkFlag, "network", "", "override network (mainnet|testnet)")
	pf.BoolVarP(&gflags.yes, "yes", "y", false, "assume yes to all prompts")

	addToGroup := func(g string, cmds ...*cobra.Command) {
		for _, c := range cmds {
			c.GroupID = g
			root.AddCommand(c)
		}
	}

	addToGroup(groupBridge,
		newBridgeCmd(),
		newQuoteAlias(),
		newTransfersCmd(),
		newBalanceCmd(),
	)
	addToGroup(groupTx,
		newTxCmd(),
	)
	addToGroup(groupChain,
		newChainsCmd(),
		newTokensCmd(),
		newStellarCmd(),
		newAlgorandCmd(),
	)
	addToGroup(groupWallet,
		newWalletCmd(),
		newConfigCmd(),
	)
	addToGroup(groupSession,
		newTUICmd(),
		newCompletionCmd(root),
	)

	return root
}

func newQuoteAlias() *cobra.Command {
	c := newBridgeQuoteCmd()
	c.Use = "quote"
	c.Short = "Shortcut for `allbridge bridge quote`"
	return c
}

func resolve(_ *cobra.Command) (*runtime, error) {
	cfg, err := config.Load()
	if err != nil {
		return nil, &ExitError{Code: ExitUser, Message: err.Error(), Cause: err}
	}

	if gflags.apiURLFlag != "" {
		cfg.API.URL = gflags.apiURLFlag
	}
	if gflags.networkFlag != "" {
		cfg.Network = gflags.networkFlag
	}

	timeout := 30 * time.Second
	if cfg.API.Timeout != "" {
		if d, err := time.ParseDuration(cfg.API.Timeout); err == nil {
			timeout = d
		}
	}
	cl, err := api.New(api.Options{
		BaseURL:   cfg.API.URL,
		Timeout:   timeout,
		UserAgent: fmt.Sprintf("allbridge-cli/%s", version.Version),
	})
	if err != nil {
		return nil, &ExitError{Code: ExitUser, Message: err.Error(), Cause: err}
	}

	var format render.Format
	if gflags.jsonOnly {
		format = render.FormatJSON
	} else {
		f, err := render.ParseFormat(gflags.output)
		if err != nil {
			return nil, &ExitError{Code: ExitUser, Message: err.Error(), Cause: err}
		}
		format = f
	}

	color := !gflags.noColor && os.Getenv("NO_COLOR") == ""
	styles := render.NewStyles(color)

	return &runtime{
		format: format,
		styles: styles,
		client: cl,
		cfg:    cfg,
		flags:  gflags,
	}, nil
}
