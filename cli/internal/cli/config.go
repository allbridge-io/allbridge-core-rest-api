package cli

import (
	"fmt"
	"sort"
	"strings"

	"github.com/spf13/cobra"

	"github.com/allbridge-io/rest-api/cli/internal/config"
	"github.com/allbridge-io/rest-api/cli/internal/render"
)

func newConfigCmd() *cobra.Command {
	c := &cobra.Command{
		Use:   "config",
		Short: "Get/set CLI configuration (~/.config/allbridge/config.yaml)",
		Long: `Read and write CLI settings. The config file lives at
${XDG_CONFIG_HOME:-~/.config}/allbridge/config.yaml. Known keys:

    api.url           REST API base URL (default: https://core-rest-api.allbridge.io)
    api.timeout       per-request timeout, e.g. 30s, 1m
    network           mainnet | testnet
    defaultWallet     wallet name used when --wallet is omitted
    rpc.<CHAIN>       per-chain RPC URL used by sign/broadcast
                      (e.g. rpc.ETH, rpc.SOL, rpc.TRX)`,
		Example: `  allbridge config set api.url https://core-rest-api.allbridge.io
  allbridge config set rpc.ETH https://eth.llamarpc.com
  allbridge config set rpc.TRX https://api.trongrid.io
  allbridge config set defaultWallet main
  allbridge config list
  allbridge config path`,
	}
	c.AddCommand(newConfigGetCmd(), newConfigSetCmd(), newConfigListCmd(), newConfigPathCmd())
	return c
}

var configKeys = map[string]struct {
	get func(*config.Config) string
	set func(*config.Config, string)
}{
	"api.url": {
		get: func(c *config.Config) string { return c.API.URL },
		set: func(c *config.Config, v string) { c.API.URL = v },
	},
	"api.timeout": {
		get: func(c *config.Config) string { return c.API.Timeout },
		set: func(c *config.Config, v string) { c.API.Timeout = v },
	},
	"network": {
		get: func(c *config.Config) string { return c.Network },
		set: func(c *config.Config, v string) { c.Network = v },
	},
	"defaultWallet": {
		get: func(c *config.Config) string { return c.DefaultWallet },
		set: func(c *config.Config, v string) { c.DefaultWallet = v },
	},
}

func newConfigGetCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "get <key>",
		Short: "Print the value of a config key",
		Args:  cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			cfg, err := config.Load()
			if err != nil {
				return err
			}
			key := args[0]
			if strings.HasPrefix(key, "rpc.") {
				_, _ = fmt.Fprintln(render.Out(), cfg.RPC[strings.TrimPrefix(key, "rpc.")])
				return nil
			}
			h, ok := configKeys[key]
			if !ok {
				return userErrf("unknown key %q", key)
			}
			_, _ = fmt.Fprintln(render.Out(), h.get(&cfg))
			return nil
		},
	}
}

func newConfigSetCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "set <key> <value>",
		Short: "Set a config value (persists to ~/.config/allbridge/config.yaml)",
		Args:  cobra.ExactArgs(2),
		RunE: func(cmd *cobra.Command, args []string) error {
			cfg, err := config.Load()
			if err != nil {
				return err
			}
			key, val := args[0], args[1]
			if strings.HasPrefix(key, "rpc.") {
				if cfg.RPC == nil {
					cfg.RPC = map[string]string{}
				}
				cfg.RPC[strings.TrimPrefix(key, "rpc.")] = val
				return config.Save(cfg)
			}
			h, ok := configKeys[key]
			if !ok {
				return userErrf("unknown key %q (allowed: %s, rpc.<chain>)", key, knownKeys())
			}
			h.set(&cfg, val)
			return config.Save(cfg)
		},
	}
}

func newConfigListCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "list",
		Short: "List all known config keys and their current values",
		Args:  cobra.NoArgs,
		RunE: func(cmd *cobra.Command, _ []string) error {
			cfg, err := config.Load()
			if err != nil {
				return err
			}
			rt, err := resolve(cmd)
			if err != nil {
				return err
			}
			t := render.NewTable("key", "value")
			for _, k := range knownKeysSlice() {
				t.Append(k, configKeys[k].get(&cfg))
			}
			for k, v := range cfg.RPC {
				t.Append("rpc."+k, v)
			}
			t.Render(render.Out(), rt.styles)
			return nil
		},
	}
}

func newConfigPathCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "path",
		Short: "Print the path of the active config directory",
		Args:  cobra.NoArgs,
		RunE: func(cmd *cobra.Command, _ []string) error {
			d, err := config.Dir()
			if err != nil {
				return err
			}
			_, _ = fmt.Fprintln(render.Out(), d)
			return nil
		},
	}
}

func knownKeys() string { return strings.Join(knownKeysSlice(), ", ") }

func knownKeysSlice() []string {
	out := make([]string, 0, len(configKeys))
	for k := range configKeys {
		out = append(out, k)
	}
	sort.Strings(out)
	return out
}
