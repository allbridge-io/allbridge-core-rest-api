package cli

import (
	"encoding/json"
	"testing"
)

func TestTransferDelivered(t *testing.T) {
	tests := []struct {
		name string
		raw  string
		want bool
	}{
		{name: "delivered", raw: `{"txId":"0x1","receive":{"txId":"0x2"}}`, want: true},
		{name: "missing receive", raw: `{"txId":"0x1"}`, want: false},
		{name: "empty receive tx", raw: `{"txId":"0x1","receive":{"txId":""}}`, want: false},
		{name: "bad json", raw: `{`, want: false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := transferDelivered(json.RawMessage(tt.raw)); got != tt.want {
				t.Fatalf("transferDelivered() = %v, want %v", got, tt.want)
			}
		})
	}
}
