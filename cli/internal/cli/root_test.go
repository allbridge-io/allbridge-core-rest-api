package cli

import (
	"bytes"
	"strings"
	"testing"
)

func TestRootCommandWiring(t *testing.T) {
	root := NewRootCmd()

	for _, name := range []string{"chains", "tokens", "balance", "bridge", "tx", "transfers", "stellar", "algorand", "wallet", "config", "tui", "completion"} {
		if _, _, err := root.Find([]string{name}); err != nil {
			t.Fatalf("command %q is not wired: %v", name, err)
		}
	}

	send, _, err := root.Find([]string{"bridge", "send"})
	if err != nil {
		t.Fatalf("bridge send is not wired: %v", err)
	}
	for _, flag := range []string{"from", "to", "amount", "recipient", "approve", "skip-checks", "dry-run"} {
		if send.Flags().Lookup(flag) == nil {
			t.Fatalf("bridge send flag %q is missing", flag)
		}
	}

	plan, _, err := root.Find([]string{"bridge", "plan"})
	if err != nil {
		t.Fatalf("bridge plan is not wired: %v", err)
	}
	for _, flag := range []string{"from", "to", "amount", "sender", "recipient"} {
		if plan.Flags().Lookup(flag) == nil {
			t.Fatalf("bridge plan flag %q is missing", flag)
		}
	}

	walletImport, _, err := root.Find([]string{"wallet", "import"})
	if err != nil {
		t.Fatalf("wallet import is not wired: %v", err)
	}
	for _, flag := range []string{"hex", "base58", "from-env", "from-env-base58"} {
		if walletImport.Flags().Lookup(flag) == nil {
			t.Fatalf("wallet import flag %q is missing", flag)
		}
	}
}

func TestRootHelpDoesNotIncludeBanner(t *testing.T) {
	root := NewRootCmd()
	var out bytes.Buffer
	root.SetOut(&out)

	oldNoColor := gflags.noColor
	gflags.noColor = true
	t.Cleanup(func() { gflags.noColor = oldNoColor })

	if err := root.Help(); err != nil {
		t.Fatalf("Help returned error: %v", err)
	}
	got := out.String()
	if strings.Contains(got, "C L I") || strings.Contains(got, "bridge cli") {
		t.Fatalf("root help included interactive banner:\n%s", got)
	}
}
