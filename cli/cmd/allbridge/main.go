// Command allbridge is a single-binary CLI for the Allbridge Core REST API.
//
// It is intentionally script-friendly: every subcommand supports `--json`,
// exit codes are stable across versions, and side effects are gated behind
// explicit confirmations or `--yes`.
package main

import (
	"context"
	"errors"
	"fmt"
	"os"
	"os/signal"
	"syscall"

	"github.com/allbridge-io/rest-api/cli/internal/cli"
)

func main() {
	ctx, cancel := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer cancel()

	if err := cli.NewRootCmd().ExecuteContext(ctx); err != nil {
		var ee *cli.ExitError
		if errors.As(err, &ee) {
			if ee.Message != "" {
				fmt.Fprintln(os.Stderr, ee.Message)
			}
			os.Exit(ee.Code)
		}
		fmt.Fprintln(os.Stderr, "error:", err)
		os.Exit(1)
	}
}
