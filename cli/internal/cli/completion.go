package cli

import (
	"fmt"

	"github.com/spf13/cobra"

	"github.com/allbridge-io/rest-api/cli/internal/render"
)

func newCompletionCmd(root *cobra.Command) *cobra.Command {
	c := &cobra.Command{
		Use:   "completion [bash|zsh|fish|powershell]",
		Short: "Generate shell completion scripts",
		Args:  cobra.ExactArgs(1),
		RunE: func(_ *cobra.Command, args []string) error {
			out := render.Out()
			switch args[0] {
			case "bash":
				return root.GenBashCompletionV2(out, true)
			case "zsh":
				return root.GenZshCompletion(out)
			case "fish":
				return root.GenFishCompletion(out, true)
			case "powershell":
				return root.GenPowerShellCompletion(out)
			default:
				return userErrf("unsupported shell %q (want bash|zsh|fish|powershell)", args[0])
			}
		},
	}
	c.SetHelpFunc(func(cmd *cobra.Command, args []string) {
		_, _ = fmt.Fprintln(render.Out(), `Generate shell completion scripts.

Examples:
  allbridge completion bash > /etc/bash_completion.d/allbridge
  allbridge completion zsh > "${fpath[1]}/_allbridge"
  allbridge completion fish > ~/.config/fish/completions/allbridge.fish
  allbridge completion powershell > allbridge.ps1`)
	})
	return c
}
