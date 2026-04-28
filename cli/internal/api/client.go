package api

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

type Client struct {
	baseURL string
	hc      *http.Client
	ua      string
}

type Options struct {
	BaseURL   string
	Timeout   time.Duration
	UserAgent string
	Transport http.RoundTripper
}

func New(opts Options) (*Client, error) {
	if strings.TrimSpace(opts.BaseURL) == "" {
		return nil, errors.New("api: base URL is required")
	}
	timeout := opts.Timeout
	if timeout == 0 {
		timeout = 30 * time.Second
	}
	hc := &http.Client{
		Timeout:   timeout,
		Transport: opts.Transport,
	}
	return &Client{
		baseURL: strings.TrimRight(opts.BaseURL, "/"),
		hc:      hc,
		ua:      defaultUA(opts.UserAgent),
	}, nil
}

func defaultUA(in string) string {
	if in != "" {
		return in
	}
	return "allbridge-cli/0.1"
}

type Error struct {
	Status  int
	Method  string
	Path    string
	Body    string // truncated
	Message string // best-effort extracted message field
}

func (e *Error) Error() string {
	if e.Message != "" {
		return fmt.Sprintf("api: %s %s -> %d: %s", e.Method, e.Path, e.Status, e.Message)
	}
	return fmt.Sprintf("api: %s %s -> %d", e.Method, e.Path, e.Status)
}

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
			return fmt.Errorf("api: marshal body: %w", err)
		}
		rdr = bytes.NewReader(buf)
	}

	req, err := http.NewRequestWithContext(ctx, method, u.String(), rdr)
	if err != nil {
		return fmt.Errorf("api: new request: %w", err)
	}
	req.Header.Set("Accept", "application/json")
	if rdr != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	req.Header.Set("User-Agent", c.ua)

	resp, err := c.hc.Do(req)
	if err != nil {
		return fmt.Errorf("api: %s %s: %w", method, path, err)
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
		return fmt.Errorf("api: decode response: %w", err)
	}
	return nil
}

func (c *Client) buildURL(path string, q url.Values) (*url.URL, error) {
	if !strings.HasPrefix(path, "/") {
		path = "/" + path
	}
	u, err := url.Parse(c.baseURL + path)
	if err != nil {
		return nil, fmt.Errorf("api: bad URL: %w", err)
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
