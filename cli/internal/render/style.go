package render

import (
	"os"

	"github.com/charmbracelet/lipgloss"
	"golang.org/x/term"
)

var (
	ColorBrand  = lipgloss.Color("#2BA89B")
	ColorAccent = lipgloss.Color("#06B6D4")
	ColorOK     = lipgloss.Color("#22C55E")
	ColorWarn   = lipgloss.Color("#F59E0B")
	ColorError  = lipgloss.Color("#EF4444")
	ColorMuted  = lipgloss.Color("#94A3B8")
	ColorHeader = lipgloss.Color("#E2E8F0")
)

type Styles struct {
	Brand  lipgloss.Style
	Header lipgloss.Style
	Muted  lipgloss.Style
	OK     lipgloss.Style
	Warn   lipgloss.Style
	Err    lipgloss.Style
	KV     lipgloss.Style
	Code   lipgloss.Style
}

func NewStyles(color bool) Styles {
	if !color || !isTerminal(os.Stdout) {
		plain := lipgloss.NewStyle()
		return Styles{Brand: plain, Header: plain, Muted: plain, OK: plain, Warn: plain, Err: plain, KV: plain, Code: plain}
	}
	return Styles{
		Brand:  lipgloss.NewStyle().Foreground(ColorBrand).Bold(true),
		Header: lipgloss.NewStyle().Foreground(ColorHeader).Bold(true).Underline(true),
		Muted:  lipgloss.NewStyle().Foreground(ColorMuted),
		OK:     lipgloss.NewStyle().Foreground(ColorOK).Bold(true),
		Warn:   lipgloss.NewStyle().Foreground(ColorWarn).Bold(true),
		Err:    lipgloss.NewStyle().Foreground(ColorError).Bold(true),
		KV:     lipgloss.NewStyle().Foreground(ColorAccent),
		Code:   lipgloss.NewStyle().Foreground(ColorMuted).Italic(true),
	}
}

func isTerminal(f *os.File) bool {
	return term.IsTerminal(int(f.Fd()))
}
