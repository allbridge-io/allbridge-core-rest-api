package render

import (
	"strings"
	"testing"
)

func TestTableRenderPadsColumns(t *testing.T) {
	table := NewTable("chain", "symbol")
	table.Append("ETH", "USDT")
	table.Append("SOLANA", "USDC")

	var out strings.Builder
	table.Render(&out, NewStyles(false))

	got := out.String()
	want := "CHAIN   SYMBOL\nETH     USDT  \nSOLANA  USDC  \n"
	if got != want {
		t.Fatalf("table output mismatch\nwant:\n%q\ngot:\n%q", want, got)
	}
}
