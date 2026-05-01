package next

import "encoding/json"

// Token is one supported asset. Identified by `TokenId` everywhere downstream
// (quote, createTx, transfer status). `Address` and `Decimals` are
// informational; the API resolves the rest from `TokenId`.
type Token struct {
	TokenID  string `json:"tokenId"`
	Chain    string `json:"chain"`
	Symbol   string `json:"symbol"`
	Address  string `json:"address"`
	Decimals int    `json:"decimals"`
	IsNative bool   `json:"isNative,omitempty"`
}

// RelayerFee is one entry inside a route's relayer-fee list. NEXT lets the
// user pay the relayer in either the chain's native token (`tokenId ==
// "native"`) or in a stablecoin (`tokenId == <some token id>`). Some routes
// require an ERC-20 approve before broadcasting the bridge tx; in that case
// the API returns a non-empty `ApprovalSpender` and the client must approve
// `Amount` of `TokenId` to that spender first.
type RelayerFee struct {
	TokenID         string `json:"tokenId"` // "native" | <stablecoin tokenId>
	Amount          string `json:"amount"`  // base units, in the payment-token precision
	ApprovalSpender string `json:"approvalSpender,omitempty"`
}

// Route is a single bridging route option returned by /quote. NEXT supports
// multi-hop routes (swap-on-source → bridge → swap-on-destination), so the
// route exposes optional intermediary tokens and per-side swap descriptors.
//
// The opaque `Messenger` is usually a string like "Allbridge", "Wormhole"
// etc.; the special value "near-intents" signals a different downstream tx
// shape.
type Route struct {
	SourceTokenID                string          `json:"sourceTokenId"`
	SourceSwap                   string          `json:"sourceSwap,omitempty"`
	SourceIntermediaryTokenID    string          `json:"sourceIntermediaryTokenId,omitempty"`
	Messenger                    string          `json:"messenger"`
	DestinationIntermediaryTokenID string        `json:"destinationIntermediaryTokenId,omitempty"`
	DestinationSwap              string          `json:"destinationSwap,omitempty"`
	DestinationTokenID           string          `json:"destinationTokenId"`
	EstimatedTime                int             `json:"estimatedTime,omitempty"` // seconds
	Amount                       string          `json:"amount"`                  // input, base units
	AmountOut                    string          `json:"amountOut"`               // output, base units
	RelayerFees                  []RelayerFee    `json:"relayerFees"`
	// Extra holds any forward-compatible fields the API might add.
	Extra json.RawMessage `json:"-"`
}

// QuoteRequest is the POST body for /quote.
type QuoteRequest struct {
	Amount             string `json:"amount"` // base units
	SourceTokenID      string `json:"sourceTokenId"`
	DestinationTokenID string `json:"destinationTokenId"`
}

// CreateTxRequest is the POST body for /tx/create. NEXT differentiates
// "standard" routes from NEAR Intents (no on-chain tx required, refundTo
// applies). For standard routes RelayerFee is required.
type CreateTxRequest struct {
	// All Route fields except Messenger are spread back into the request, so
	// the server knows which exact route to materialise.
	SourceTokenID                  string `json:"sourceTokenId"`
	SourceSwap                     string `json:"sourceSwap,omitempty"`
	SourceIntermediaryTokenID      string `json:"sourceIntermediaryTokenId,omitempty"`
	Messenger                      string `json:"messenger"`
	DestinationIntermediaryTokenID string `json:"destinationIntermediaryTokenId,omitempty"`
	DestinationSwap                string `json:"destinationSwap,omitempty"`
	DestinationTokenID             string `json:"destinationTokenId"`
	EstimatedTime                  int    `json:"estimatedTime,omitempty"`

	Amount             string `json:"amount"`
	SourceAddress      string `json:"sourceAddress"`
	DestinationAddress string `json:"destinationAddress"`
	Metadata           string `json:"metadata,omitempty"`

	// RelayerFee is required for standard routes; for NEAR Intents it is
	// optional (the protocol decides). RefundTo is NEAR-Intents-only.
	RelayerFee *RelayerFee `json:"relayerFee,omitempty"`
	RefundTo   string      `json:"refundTo,omitempty"`
}

// Tx is the raw transaction payload returned inside CreateTxResponse. Shape
// is chain-specific; we preserve all fields so chain-specific signers can
// adapt as needed:
//
//   EVM     ContractAddress + Value + Tx (hex call data) — needs gas/nonce
//   Tron    ContractAddress + Value + Tx (hex call data) — TRC-20 trigger
//   Solana  Tx (base64 VersionedTransaction); ContractAddress unused
type Tx struct {
	ContractAddress string `json:"contractAddress"`
	Value           string `json:"value"`
	Tx              string `json:"tx,omitempty"` // empty for native-value sends
}

// CreateTxResponse is what /tx/create returns. AmountOut and AmountMin both
// arrive in destination-token base units.
type CreateTxResponse struct {
	AmountOut string `json:"amountOut"`
	AmountMin string `json:"amountMin"`
	Tx        Tx     `json:"tx"`
}

// TxStatus mirrors GET /transfer/status?tx=<id> (and the per-row shape
// inside ExplorerPage.Data — they're the same envelope on the wire).
type TxStatus struct {
	Sender              string  `json:"sender"`
	SourceChain         string  `json:"sourceChain"`
	SourceTokenID       string  `json:"sourceTokenId"`
	DestinationChain    string  `json:"destinationChain"`
	DestinationTokenID  string  `json:"destinationTokenId"`
	AmountIn            string  `json:"amountIn"`
	AmountInFormatted   string  `json:"amountInFormatted"`
	AmountOut           string  `json:"amountOut,omitempty"`
	AmountOutFormatted  string  `json:"amountOutFormatted,omitempty"`
	SendTx              TxRef   `json:"sendTx"`
	ReceiveTx           *TxRef  `json:"receiveTx,omitempty"`
	Recipient           string  `json:"recipient"`
	Status              string  `json:"status"` // SUCCESS | PROCESSING | FAILED | REFUNDED
	EstimatedTime       int     `json:"estimatedTime,omitempty"`
}

type TxRef struct {
	ID        string `json:"id"`
	Timestamp int64  `json:"timestamp"` // unix seconds
}

// ExplorerPage is the GET /transfers paginated response.
type ExplorerPage struct {
	Data  []TxStatus `json:"data"`
	Page  int        `json:"page"`
	Limit int        `json:"limit"`
	Total int        `json:"total"`
}
