package cli

import (
	"fmt"
	"io"
	"strconv"

	"github.com/allbridge-io/rest-api/cli/internal/render"
)

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
