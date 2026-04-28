package api

import "encoding/json"

type ChainDetail struct {
	ChainID        json.Number     `json:"chainId,omitempty"`
	Name           string          `json:"name,omitempty"`
	ChainSymbol    string          `json:"chainSymbol,omitempty"`
	ChainType      string          `json:"chainType,omitempty"`
	Tokens         []TokenDetail   `json:"tokens,omitempty"`
	TxTime         json.RawMessage `json:"txTime,omitempty"`
	ConfirmingBlks int             `json:"confirmations,omitempty"`
	Raw            json.RawMessage `json:"-"`
}

type TokenDetail struct {
	Symbol         string          `json:"symbol,omitempty"`
	Name           string          `json:"name,omitempty"`
	Decimals       int             `json:"decimals,omitempty"`
	PoolAddress    string          `json:"poolAddress,omitempty"`
	TokenAddress   string          `json:"tokenAddress,omitempty"`
	OriginTokenAdr string          `json:"originTokenAddress,omitempty"`
	ChainSymbol    string          `json:"chainSymbol,omitempty"`
	ChainType      string          `json:"chainType,omitempty"`
	FeeShare       string          `json:"feeShare,omitempty"`
	APR            string          `json:"apr,omitempty"`
	Raw            json.RawMessage `json:"-"`
}

type QuoteRequest struct {
	SourceChainSymbol      string `json:"sourceChainSymbol"`
	SourceTokenAddress     string `json:"sourceTokenAddress"`
	DestinationChainSymbol string `json:"destinationChainSymbol"`
	DestinationTokenAddr   string `json:"destinationTokenAddress"`
	AmountInTokenPrecision string `json:"amountInTokenPrecision"`
	Messenger              string `json:"messenger,omitempty"`
	FeePaymentMethod       string `json:"feePaymentMethod,omitempty"`
}

type QuoteResponse = json.RawMessage

type TransferStatus = json.RawMessage

type RawTxRequest map[string]any

type RawTxResponse = json.RawMessage
