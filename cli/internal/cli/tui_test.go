package cli

import (
	"strings"
	"testing"

	"github.com/charmbracelet/lipgloss"
)

func TestTokenChipFocusedAndUnfocusedHaveSameWidth(t *testing.T) {
	m := tuiModel{}
	st := tuiStyles(true)
	tk := tuiToken{Chain: "ETH", Symbol: "USDT"}

	normal := m.tokenChip(st, tk, false, "select source")
	focused := m.tokenChip(st, tk, true, "select source")
	if lipgloss.Width(normal) != lipgloss.Width(focused) {
		t.Fatalf("token chip widths differ: normal=%d focused=%d\nnormal=%q\nfocused=%q",
			lipgloss.Width(normal), lipgloss.Width(focused), normal, focused)
	}
}

func TestGlobalLinkKeys(t *testing.T) {
	cases := map[string]string{
		"ctrl+o": "https://core.allbridge.io",
		"ctrl+d": "https://docs-core.allbridge.io",
		"ctrl+g": "https://github.com/allbridge-io",
	}
	for key, want := range cases {
		got, ok := globalLinkForKey(key)
		if !ok {
			t.Fatalf("globalLinkForKey(%q) = not ok", key)
		}
		if got != want {
			t.Fatalf("globalLinkForKey(%q) = %q, want %q", key, got, want)
		}
	}
}

func TestFormTabCyclesFocus(t *testing.T) {
	m := tuiModel{state: stateForm, focus: focusSendAmount}

	next, _ := m.handleFormKey("tab")
	m = next.(tuiModel)
	if m.focus != focusSendToken {
		t.Fatalf("after tab focus = %v, want %v", m.focus, focusSendToken)
	}

	next, _ = m.handleFormKey("shift+tab")
	m = next.(tuiModel)
	if m.focus != focusSendAmount {
		t.Fatalf("after shift-tab focus = %v, want %v", m.focus, focusSendAmount)
	}
}

func TestCtrlNumberJumpsFocus(t *testing.T) {
	cases := map[string]focusField{
		"ctrl+1": focusSendAmount,
		"ctrl+2": focusSendToken,
		"ctrl+3": focusReceiveToken,
		"ctrl+4": focusRecipient,
		"ctrl+5": focusMessenger,
		"ctrl+6": focusFeeMethod,
		"ctrl+7": focusSend,
	}
	for key, want := range cases {
		m := tuiModel{state: stateForm, focus: focusSendAmount}
		next, _ := m.handleFormKey(key)
		m = next.(tuiModel)
		if m.focus != want {
			t.Fatalf("%s -> focus = %v, want %v", key, m.focus, want)
		}
	}
}

func TestPickerScrollKeepsCursorVisible(t *testing.T) {
	m := tuiModel{
		state:  statePicker,
		picker: pickerSendToken,
		tokens: []tuiToken{
			{Chain: "ETH", Symbol: "USDT"},
			{Chain: "ETH", Symbol: "USDC"},
			{Chain: "ETH", Symbol: "USDe"},
			{Chain: "ETH", Symbol: "USDT0"},
			{Chain: "ETH", Symbol: "DAI"},
			{Chain: "ETH", Symbol: "WETH"},
			{Chain: "ETH", Symbol: "WBTC"},
			{Chain: "ETH", Symbol: "FRAX"},
			{Chain: "ETH", Symbol: "LUSD"},
			{Chain: "ETH", Symbol: "GHO"},
			{Chain: "ETH", Symbol: "PYUSD"},
			{Chain: "ETH", Symbol: "EURC"},
			{Chain: "ETH", Symbol: "USDP"},
			{Chain: "ETH", Symbol: "RLUSD"},
		},
	}

	for i := 0; i < 13; i++ {
		next, _ := m.handlePickerKey("down")
		m = next.(tuiModel)
	}
	if m.pickerCursor != 13 {
		t.Fatalf("cursor = %d, want 13", m.pickerCursor)
	}
	if m.pickerOffset == 0 {
		t.Fatalf("offset = %d, want > 0 after scrolling", m.pickerOffset)
	}
	if m.pickerOffset > m.pickerCursor {
		t.Fatalf("offset = %d, cursor = %d", m.pickerOffset, m.pickerCursor)
	}

	out := m.renderPicker(tuiStyles(true))
	if !strings.Contains(out, "RLUSD") {
		t.Fatalf("picker output missing scrolled item\n%s", out)
	}
}
