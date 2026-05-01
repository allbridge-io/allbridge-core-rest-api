// Package next is a thin REST client for the Allbridge NEXT API
// (https://api.next.allbridge.io). NEXT is the second-generation Allbridge
// product; this CLI talks to both Core and NEXT through one binary, with
// `--api core|next|auto` choosing which surface to use per command.
//
// The shape of NEXT differs from Core:
//
//   - Tokens are identified by an opaque `tokenId`, not (chain, address).
//   - There is no `/chains` endpoint — chain info is embedded in tokens.
//   - `/quote` is POST with a JSON body (sourceTokenId, destinationTokenId,
//     amount in base units) and returns an array of route options.
//   - `/tx/create` is POST and returns `{contractAddress, value, tx}` where
//     `tx` is *raw call data* for EVM (we still need to fetch gas/nonce/
//     chainId from RPC ourselves), or a base64 VersionedTransaction for
//     Solana, or a hex-encoded TRC20 call for Tron.
//   - `/transfer/status?tx=<id>` returns a different shape than Core's
//     `/transfer/status?chain=&txId=`.
//   - `/transfers?page=N&limit=M` paginated explorer feed.
//
// The types here mirror the TypeScript models in the NEXT web app
// (allbridge-next-ui). Field names follow the wire JSON; we preserve
// unrecognised fields via json.RawMessage where the schema is rich enough
// that adding a typed field for every variation would be premature.
package next

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

// Client is a small HTTP client over the NEXT REST API. Mirrors the same
// patterns as internal/api.Client so consumers feel familiar; we keep them
// in separate packages so the two product surfaces remain visibly distinct.
type Client struct {
	baseURL string
	hc      *http.Client
	ua      string
}

// Options configure a new Client. BaseURL is required.
type Options struct {
	BaseURL   string
	Timeout   time.Duration
	UserAgent string
	Transport http.RoundTripper
}

// New returns a Client.
func New(opts Options) (*Client, error) {
	if strings.TrimSpace(opts.BaseURL) == "" {
		return nil, errors.New("next: base URL is required")
	}
	timeout := opts.Timeout
	if timeout == 0 {
		timeout = 30 * time.Second
	}
	ua := opts.UserAgent
	if ua == "" {
		ua = "allbridge-cli-next/0.1"
	}
	return &Client{
		baseURL: strings.TrimRight(opts.BaseURL, "/"),
		hc:      &http.Client{Timeout: timeout, Transport: opts.Transport},
		ua:      ua,
	}, nil
}

// Error captures a non-2xx response in a way that prints cleanly.
type Error struct {
	Status  int
	Method  string
	Path    string
	Body    string // truncated
	Message string // best-effort extracted message
}

func (e *Error) Error() string {
	if e.Message != "" {
		return fmt.Sprintf("next: %s %s -> %d: %s", e.Method, e.Path, e.Status, e.Message)
	}
	return fmt.Sprintf("next: %s %s -> %d", e.Method, e.Path, e.Status)
}

// Get / Post — same interface as internal/api.Client for ease of swapping.

func (c *Client) Get(ctx context.Context, path string, q url.Values, out any) error {
	return c.do(ctx, http.MethodGet, path, q, nil, out)
}

func (c *Client) Post(ctx context.Context, path string, q url.Values, body, out any) error {
	return c.do(ctx, http.MethodPost, path, q, body, out)
}

func (c *Client) do(ctx context.Context, method, path string, q url.Values, body, out any) error {
	u, err := c.buildURL(path, q)
	if err != nil {
		return err
	}

	var rdr io.Reader
	if body != nil {
		buf, err := json.Marshal(body)
		if err != nil {
			return fmt.Errorf("next: marshal body: %w", err)
		}
		rdr = bytes.NewReader(buf)
	}

	req, err := http.NewRequestWithContext(ctx, method, u.String(), rdr)
	if err != nil {
		return fmt.Errorf("next: new request: %w", err)
	}
	req.Header.Set("Accept", "application/json")
	if rdr != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	req.Header.Set("User-Agent", c.ua)

	resp, err := c.hc.Do(req)
	if err != nil {
		return fmt.Errorf("next: %s %s: %w", method, path, err)
	}
	defer func() { _ = resp.Body.Close() }()

	const maxRead = 1 << 20
	raw, _ := io.ReadAll(io.LimitReader(resp.Body, maxRead))

	if resp.StatusCode/100 != 2 {
		apiErr := &Error{
			Status: resp.StatusCode,
			Method: method,
			Path:   path,
			Body:   truncate(string(raw), 512),
		}
		var probe map[string]any
		if json.Unmarshal(raw, &probe) == nil {
			if m, ok := probe["message"].(string); ok && m != "" {
				apiErr.Message = m
			} else if m, ok := probe["error"].(string); ok && m != "" {
				apiErr.Message = m
			}
		}
		return apiErr
	}

	if out == nil || len(raw) == 0 {
		return nil
	}
	if err := json.Unmarshal(raw, out); err != nil {
		return fmt.Errorf("next: decode response: %w", err)
	}
	return nil
}

func (c *Client) buildURL(path string, q url.Values) (*url.URL, error) {
	if !strings.HasPrefix(path, "/") {
		path = "/" + path
	}
	u, err := url.Parse(c.baseURL + path)
	if err != nil {
		return nil, fmt.Errorf("next: bad URL: %w", err)
	}
	if len(q) > 0 {
		existing := u.Query()
		for k, vs := range q {
			for _, v := range vs {
				existing.Add(k, v)
			}
		}
		u.RawQuery = existing.Encode()
	}
	return u, nil
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "..."
}

// ---------- typed convenience methods ----------

// Tokens hits GET /tokens.
func (c *Client) Tokens(ctx context.Context) ([]Token, error) {
	var out []Token
	if err := c.Get(ctx, "/tokens", nil, &out); err != nil {
		return nil, err
	}
	return out, nil
}

// Prices hits GET /prices and returns a map of tokenId → USD price.
func (c *Client) Prices(ctx context.Context) (map[string]float64, error) {
	var out map[string]float64
	if err := c.Get(ctx, "/prices", nil, &out); err != nil {
		return nil, err
	}
	return out, nil
}

// Quote hits POST /quote and returns the available routes (most-preferred
// first, by NEXT's own ordering).
func (c *Client) Quote(ctx context.Context, req QuoteRequest) ([]Route, error) {
	var out []Route
	if err := c.Post(ctx, "/quote", nil, req, &out); err != nil {
		return nil, err
	}
	return out, nil
}

// CreateTx hits POST /tx/create and returns the unsigned transaction
// payload ready to be signed and broadcast (after gas estimation for EVM).
func (c *Client) CreateTx(ctx context.Context, req CreateTxRequest) (*CreateTxResponse, error) {
	var out CreateTxResponse
	if err := c.Post(ctx, "/tx/create", nil, req, &out); err != nil {
		return nil, err
	}
	return &out, nil
}

// TransferStatus hits GET /transfer/status?tx=<id>.
func (c *Client) TransferStatus(ctx context.Context, txID string) (*TxStatus, error) {
	q := url.Values{}
	q.Set("tx", txID)
	var out TxStatus
	if err := c.Get(ctx, "/transfer/status", q, &out); err != nil {
		return nil, err
	}
	return &out, nil
}

// Transfers hits GET /transfers?page=&limit= (explorer feed).
func (c *Client) Transfers(ctx context.Context, page, limit int) (*ExplorerPage, error) {
	q := url.Values{}
	if page > 0 {
		q.Set("page", fmt.Sprintf("%d", page))
	}
	if limit > 0 {
		q.Set("limit", fmt.Sprintf("%d", limit))
	}
	var out ExplorerPage
	if err := c.Get(ctx, "/transfers", q, &out); err != nil {
		return nil, err
	}
	return &out, nil
}
