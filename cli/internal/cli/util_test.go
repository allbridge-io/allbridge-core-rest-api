package cli

import "testing"

func TestResolveTokenRef(t *testing.T) {
	tokens := []map[string]any{
		{
			"chainSymbol":  "ETH",
			"symbol":       "USDT",
			"tokenAddress": "0xdac17f958d2ee523a2206206994597c13d831ec7",
		},
		{
			"chainSymbol":  "SOL",
			"symbol":       "USDT",
			"tokenAddress": "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY7GZpyo6Jb2R2j",
		},
	}

	tests := []struct {
		name string
		ref  string
		want string
	}{
		{name: "symbol", ref: "ETH:USDT", want: "0xdac17f958d2ee523a2206206994597c13d831ec7"},
		{name: "address case insensitive", ref: "eth:0xDAC17F958D2EE523A2206206994597C13D831EC7", want: "0xdac17f958d2ee523a2206206994597c13d831ec7"},
		{name: "chain distinguishes duplicate symbols", ref: "SOL:USDT", want: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY7GZpyo6Jb2R2j"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := resolveTokenRef(tokens, tt.ref)
			if err != nil {
				t.Fatalf("resolveTokenRef returned error: %v", err)
			}
			if getStr(got, "tokenAddress") != tt.want {
				t.Fatalf("tokenAddress = %q, want %q", getStr(got, "tokenAddress"), tt.want)
			}
		})
	}
}

func TestResolveTokenRefRejectsBadInput(t *testing.T) {
	tokens := []map[string]any{{"chainSymbol": "ETH", "symbol": "USDT", "tokenAddress": "0x1"}}

	for _, ref := range []string{"ETH", "ETH:", "POL:USDT"} {
		t.Run(ref, func(t *testing.T) {
			if _, err := resolveTokenRef(tokens, ref); err == nil {
				t.Fatal("resolveTokenRef returned nil error")
			}
		})
	}
}

func TestCmpDecimalStrings(t *testing.T) {
	tests := []struct {
		a, b string
		want int
	}{
		{a: "", b: "0", want: 0},
		{a: "0001", b: "1", want: 0},
		{a: "9", b: "10", want: -1},
		{a: "10", b: "9", want: 1},
		{a: "1000000000000000000000000000000", b: "999999999999999999999999999999", want: 1},
		{a: "12345678901234567890", b: "12345678901234567891", want: -1},
	}

	for _, tt := range tests {
		t.Run(tt.a+"_"+tt.b, func(t *testing.T) {
			if got := cmpDecimalStrings(tt.a, tt.b); got != tt.want {
				t.Fatalf("cmpDecimalStrings(%q, %q) = %d, want %d", tt.a, tt.b, got, tt.want)
			}
		})
	}
}
