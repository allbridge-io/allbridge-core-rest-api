package render

import (
	"fmt"
	"os"
	"strings"

	"github.com/charmbracelet/lipgloss"
	"golang.org/x/term"
)

var (
	bannerLogoGradient = []lipgloss.Color{
		"#4F46E5", "#405CE2", "#3273DE", "#2389DB", "#15A0D7", "#06B6D4",
	}
	bannerBridgeWire  = lipgloss.Color("#94A3B8")
	bannerBridgeWater = lipgloss.Color("#0EA5E9")
	bannerBridgeFill  = lipgloss.Color("#CBD5E1")
	bannerVersionDim  = lipgloss.Color("#64748B")
	bannerSuccessOK   = lipgloss.Color("#22C55E")
	bannerSuccessAmt  = lipgloss.Color("#E2E8F0")
)

var bannerWideLogoRows = []string{
	`  █████╗ ██╗     ██╗     ██████╗ ██████╗ ██╗██████╗  ██████╗ ███████╗`,
	` ██╔══██╗██║     ██║     ██╔══██╗██╔══██╗██║██╔══██╗██╔════╝ ██╔════╝`,
	` ███████║██║     ██║     ██████╔╝██████╔╝██║██║  ██║██║  ███╗█████╗  `,
	` ██╔══██║██║     ██║     ██╔══██╗██╔══██╗██║██║  ██║██║   ██║██╔══╝  `,
	` ██║  ██║███████╗███████╗██████╔╝██║  ██║██║██████╔╝╚██████╔╝███████╗`,
	` ╚═╝  ╚═╝╚══════╝╚══════╝╚═════╝ ╚═╝  ╚═╝╚═╝╚═════╝  ╚═════╝ ╚══════╝`,
}

var bannerWideBridge = []string{
	`         ╭──────╮  ═══╤═══════╤═══════╤═══════╤═══  ╭──────╮`,
	`         │ src  │══╤══╧═══╤═══════╤═══════╤═══════╤═│ dst  │`,
	`         ╰──┬───╯  ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  ╰───┬──╯`,
	`            ▼          tokens · chains · liquidity      ▼   `,
}

var bannerNarrowLogoRows = []string{
	` ▄▀█ █░░ █░░ █▄▄ █▀█ █ █▀▄ █▀▀ █▀▀`,
	` █▀█ █▄▄ █▄▄ █▄█ █▀▄ █ █▄▀ █▄█ ██▄`,
}

func Banner(version string, color bool) string {
	w := termWidth()
	if w >= 75 {
		return renderWideBanner(version, color)
	}
	return renderNarrowBanner(version, color)
}

func termWidth() int {
	if w, _, err := term.GetSize(int(os.Stdout.Fd())); err == nil && w > 0 {
		return w
	}
	if w, _, err := term.GetSize(int(os.Stderr.Fd())); err == nil && w > 0 {
		return w
	}
	return 80
}

func renderWideBanner(version string, color bool) string {
	var sb strings.Builder
	sb.WriteString("\n")

	for i, line := range bannerWideLogoRows {
		if color {
			c := bannerLogoGradient[i%len(bannerLogoGradient)]
			sb.WriteString(lipgloss.NewStyle().Foreground(c).Bold(true).Render(line))
		} else {
			sb.WriteString(line)
		}
		sb.WriteString("\n")
	}

	caption := fmt.Sprintf("                  ─────────  C L I   %s  ─────────", version)
	if color {
		sb.WriteString(lipgloss.NewStyle().Foreground(bannerVersionDim).Render(caption))
	} else {
		sb.WriteString(caption)
	}
	sb.WriteString("\n")

	for _, line := range bannerWideBridge {
		if color {
			sb.WriteString(colorBridgeLine(line))
		} else {
			sb.WriteString(line)
		}
		sb.WriteString("\n")
	}

	sb.WriteString("\n")
	return sb.String()
}

func colorBridgeLine(line string) string {
	wire := lipgloss.NewStyle().Foreground(bannerBridgeWire)
	water := lipgloss.NewStyle().Foreground(bannerBridgeWater)
	fill := lipgloss.NewStyle().Foreground(bannerBridgeFill)

	var sb strings.Builder
	for _, r := range line {
		switch r {
		case '░':
			sb.WriteString(water.Render(string(r)))
		case '│', '─', '╭', '╮', '╰', '╯', '═', '╤', '╧', '┬', '╱', '╲', '▼':
			sb.WriteString(wire.Render(string(r)))
		default:
			sb.WriteString(fill.Render(string(r)))
		}
	}
	return sb.String()
}

func renderNarrowBanner(version string, color bool) string {
	var sb strings.Builder
	sb.WriteString("\n")
	for i, line := range bannerNarrowLogoRows {
		if color {
			c := bannerLogoGradient[i*5%len(bannerLogoGradient)]
			sb.WriteString(lipgloss.NewStyle().Foreground(c).Bold(true).Render(line))
		} else {
			sb.WriteString(line)
		}
		sb.WriteString("\n")
	}
	caption := fmt.Sprintf(" ────────  bridge cli  %s  ────────", version)
	if color {
		sb.WriteString(lipgloss.NewStyle().Foreground(bannerVersionDim).Render(caption))
	} else {
		sb.WriteString(caption)
	}
	sb.WriteString("\n\n")
	return sb.String()
}

func SuccessBanner(srcChain, dstChain, amount, symbol, hash, explorerURL string, duration string, color bool) string {
	src := pad6(srcChain)
	dst := pad6(dstChain)

	var sb strings.Builder
	sb.WriteString("\n")
	wire := func(s string) string {
		if !color {
			return s
		}
		return lipgloss.NewStyle().Foreground(bannerBridgeWire).Render(s)
	}
	water := func(s string) string {
		if !color {
			return s
		}
		return lipgloss.NewStyle().Foreground(bannerBridgeWater).Render(s)
	}
	chip := func(label string) string {
		if !color {
			return "│ " + label + " │"
		}
		return wire("│ ") + lipgloss.NewStyle().Foreground(bannerBridgeFill).Bold(true).Render(label) + wire(" │")
	}
	arrowLine := wire("══════════ ") + lipgloss.NewStyle().Foreground(bannerBridgeWater).Render(">> >> >> >> >> >> >>") + wire(" ══════════")
	if !color {
		arrowLine = "══════════ >> >> >> >> >> >> >> ══════════"
	}

	sb.WriteString("   " + wire("╭──────╮") + "  " + arrowLine + "  " + wire("╭──────╮") + "\n")
	sb.WriteString("   " + chip(src) + wire("═══════════════════════════════════") + chip(dst) + "\n")
	sb.WriteString("   " + wire("╰──────╯") + "  " + water("░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░") + "  " + wire("╰──────╯") + "\n")

	stat := fmt.Sprintf("              %s %s  ✓  bridged in %s", amount, symbol, duration)
	if color {
		stat = "              " +
			lipgloss.NewStyle().Foreground(bannerSuccessAmt).Bold(true).Render(amount+" "+symbol) +
			"  " + lipgloss.NewStyle().Foreground(bannerSuccessOK).Bold(true).Render("✓") +
			"  " + lipgloss.NewStyle().Foreground(bannerVersionDim).Render("bridged in "+duration)
	}
	sb.WriteString(stat + "\n")

	hashLine := fmt.Sprintf("              tx: %s", shortHash(hash))
	if explorerURL != "" {
		hashLine += "   ↗ " + explorerURL
	}
	if color {
		hashLine = "              " +
			lipgloss.NewStyle().Foreground(bannerVersionDim).Render("tx: "+shortHash(hash))
		if explorerURL != "" {
			hashLine += "   " + lipgloss.NewStyle().Foreground(bannerBridgeWater).Render("↗ "+explorerURL)
		}
	}
	sb.WriteString(hashLine + "\n\n")
	return sb.String()
}

func pad6(s string) string {
	if len(s) >= 4 {
		s = " " + s[:4] + " "
	} else {
		s = " " + s + strings.Repeat(" ", 5-len(s))
	}
	return s
}

func shortHash(s string) string {
	if len(s) <= 14 {
		return s
	}
	return s[:8] + "…" + s[len(s)-6:]
}
