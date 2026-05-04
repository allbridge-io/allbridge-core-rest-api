package cli

import (
	"fmt"
	"io"
	"strconv"
	"strings"

	"github.com/allbridge-io/rest-api/cli/internal/render"
	"github.com/allbridge-io/rest-api/cli/internal/wallet"
)

// resolveAddressRef expands `@walletname` into the wallet's stored address;
// any other input is returned verbatim. Empty input passes through too.
//
// Lets users type `--recipient @main-sol` instead of pasting a 44-char
// base58 string — works everywhere we accept a chain address (recipient,
// sender, refund-to, ...). The `@` prefix is unambiguous: no chain we
// support uses it in real addresses.
func resolveAddressRef(s string) (string, error) {
	s = strings.TrimSpace(s)
	if !strings.HasPrefix(s, "@") {
		return s, nil
	}
	name := strings.TrimPrefix(s, "@")
	if name == "" {
		return "", userErr("empty wallet ref (use @<name>)")
	}
	st, err := wallet.Load()
	if err != nil {
		return "", walletErr(err.Error())
	}
	e, err := st.Get(name)
	if err != nil {
		return "", walletErrf("wallet ref %q: %v", s, err)
	}
	return e.Address, nil
}

func getStr(m map[string]any, key string) string {
	if m == nil {
		return ""
	}
	v, ok := m[key]
	if !ok || v == nil {
		return ""
	}
	switch t := v.(type) {
	case string:
		return t
	case float64:
		if t == float64(int64(t)) {
			return strconv.FormatInt(int64(t), 10)
		}
		return strconv.FormatFloat(t, 'f', -1, 64)
	case bool:
		if t {
			return "true"
		}
		return "false"
	default:
		return fmt.Sprint(t)
	}
}

func itoa(i int) string { return strconv.Itoa(i) }

func fprintln(w io.Writer, s ...any) { _, _ = fmt.Fprintln(w, s...) }

func kv(w io.Writer, s render.Styles, key, value string) {
	_, _ = fmt.Fprintf(w, "%s %s\n", s.Muted.Render(padTo(key+":", 14)), value)
}

func padTo(s string, n int) string {
	if len(s) >= n {
		return s
	}
	pad := make([]byte, n-len(s))
	for i := range pad {
		pad[i] = ' '
	}
	return s + string(pad)
}
