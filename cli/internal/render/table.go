package render

import (
	"fmt"
	"io"
	"strings"
	"unicode/utf8"
)

type Table struct {
	headers []string
	rows    [][]string
}

func NewTable(headers ...string) *Table {
	return &Table{headers: headers}
}

func (t *Table) Append(cells ...any) {
	row := make([]string, len(cells))
	for i, c := range cells {
		row[i] = fmt.Sprint(c)
	}
	t.rows = append(t.rows, row)
}

func (t *Table) Render(w io.Writer, s Styles) {
	if len(t.headers) == 0 && len(t.rows) == 0 {
		return
	}
	widths := make([]int, len(t.headers))
	for i, h := range t.headers {
		widths[i] = utf8.RuneCountInString(h)
	}
	for _, row := range t.rows {
		for i, cell := range row {
			if i >= len(widths) {
				continue
			}
			if w := utf8.RuneCountInString(cell); w > widths[i] {
				widths[i] = w
			}
		}
	}

	var hb strings.Builder
	for i, h := range t.headers {
		hb.WriteString(s.Header.Render(padRight(strings.ToUpper(h), widths[i])))
		if i < len(t.headers)-1 {
			hb.WriteString("  ")
		}
	}
	_, _ = fmt.Fprintln(w, hb.String())

	for _, row := range t.rows {
		var rb strings.Builder
		for i := range t.headers {
			cell := ""
			if i < len(row) {
				cell = row[i]
			}
			rb.WriteString(padRight(cell, widths[i]))
			if i < len(t.headers)-1 {
				rb.WriteString("  ")
			}
		}
		_, _ = fmt.Fprintln(w, rb.String())
	}
}

func padRight(s string, n int) string {
	pad := n - utf8.RuneCountInString(s)
	if pad <= 0 {
		return s
	}
	return s + strings.Repeat(" ", pad)
}
