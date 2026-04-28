package cli

import (
	"context"
	"encoding/json"
	"fmt"
	"net/url"
	"os"
	"os/exec"
	"sort"
	"strconv"
	"strings"
	"time"

	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
	"github.com/spf13/cobra"
	"golang.org/x/term"

	"github.com/allbridge-io/rest-api/cli/internal/version"
)

type uiState int

const (
	stateForm uiState = iota
	statePicker
)

type focusField int

const (
	focusSendAmount focusField = iota
	focusSendToken
	focusReceiveToken
	focusRecipient
	focusMessenger
	focusFeeMethod
	focusSend
	focusFieldCount
)

type pickerKind int

const (
	pickerNone pickerKind = iota
	pickerSendToken
	pickerReceiveToken
)

type tuiToken struct {
	Chain    string
	Symbol   string
	Address  string
	Decimals int
}

type tuiPayment struct {
	Method string // WITH_NATIVE_CURRENCY | WITH_STABLECOIN | WITH_ABR
	Fee    string // base units, in the *payment* token precision
}

type tuiOption struct {
	Messenger string
	EtaMs     string
	MinOut    string // base units, in destination-token precision
	MaxOut    string
	Payments  []tuiPayment
}

type tuiTokensMsg struct {
	tokens []tuiToken
	err    error
}
type tuiQuoteMsg struct {
	options []tuiOption
	err     error
}
type tuiTickMsg time.Time

type tuiModel struct {
	ctx context.Context
	rt  *runtime

	width, height int

	state   uiState
	focus   focusField
	loading bool
	quoting bool
	quoted  bool
	err     string
	spinIdx int

	tokens []tuiToken

	sendAmount string // human units
	sendToken  tuiToken
	recvToken  tuiToken
	recipient  string

	options           []tuiOption
	selectedMessenger string
	selectedFee       string

	picker       pickerKind
	pickerCursor int
	pickerOffset int
	pickerChain  string // "" = "All"
	pickerSearch string

	walletName string

	finalCmdOut *string
}

const pickerVisibleRows = 12

func newTUICmd() *cobra.Command {
	return &cobra.Command{
		Use:   "tui",
		Short: "Open the interactive Swap dashboard",
		Long: `Step-by-step Swap wizard. Walks you through source / destination
chain & token, recipient, messenger and fee payment method. The final step
prints a ready-to-run ` + "`allbridge bridge send`" + ` command to stdout
(and copies it to the clipboard if a system tool is available) so the
output is preserved even if you accidentally quit.`,
		Args: cobra.NoArgs,
		RunE: func(cmd *cobra.Command, _ []string) error { return runTUI(cmd) },
	}
}

func runTUI(cmd *cobra.Command) error {
	if !term.IsTerminal(int(os.Stdout.Fd())) {
		return userErr("tui requires an interactive terminal")
	}
	rt, err := resolve(cmd)
	if err != nil {
		return err
	}
	var produced string
	m := tuiModel{
		ctx:         cmd.Context(),
		rt:          rt,
		state:       stateForm,
		loading:     true,
		focus:       focusSendAmount,
		sendAmount:  "100",
		walletName:  rt.cfg.DefaultWallet,
		finalCmdOut: &produced,
	}
	if _, err := tea.NewProgram(m, tea.WithAltScreen()).Run(); err != nil {
		return &ExitError{Code: ExitUser, Message: err.Error(), Cause: err}
	}
	if produced != "" {
		fmt.Println()
		fmt.Println("─── copy / run the command below ───────────────────────────────────────────")
		fmt.Println(produced)
		fmt.Println("────────────────────────────────────────────────────────────────────────────")
		if cerr := copyToClipboard(produced); cerr == nil {
			fmt.Println("(also copied to your clipboard)")
		}
	}
	return nil
}

func copyToClipboard(s string) error {
	candidates := []struct {
		name string
		args []string
	}{
		{"pbcopy", nil},  // macOS
		{"wl-copy", nil}, // Wayland
		{"xclip", []string{"-selection", "clipboard"}}, // X11
		{"xsel", []string{"--clipboard", "--input"}},   // X11 fallback
		{"clip.exe", nil}, // WSL → Windows
	}
	for _, c := range candidates {
		cmd := exec.Command(c.name, c.args...)
		cmd.Stdin = strings.NewReader(s)
		if err := cmd.Run(); err == nil {
			return nil
		}
	}
	return fmt.Errorf("no clipboard tool found")
}

func globalLinkForKey(key string) (string, bool) {
	switch key {
	case "ctrl+o":
		return "https://core.allbridge.io", true
	case "ctrl+d":
		return "https://docs-core.allbridge.io", true
	case "ctrl+g":
		return "https://github.com/allbridge-io", true
	default:
		return "", false
	}
}

func openExternalLink(link string) error {
	candidates := [][]string{
		{"open", link},        // macOS
		{"xdg-open", link},    // Linux
		{"gio", "open", link}, // GNOME / GLib
	}
	for _, args := range candidates {
		if len(args) == 0 {
			continue
		}
		cmd := exec.Command(args[0], args[1:]...)
		if err := cmd.Run(); err == nil {
			return nil
		}
	}
	return fmt.Errorf("unable to open %s", link)
}

func (m tuiModel) Init() tea.Cmd {
	return tea.Batch(tuiFetchTokens(m.ctx, m.rt), tuiTick())
}

func tuiFetchTokens(ctx context.Context, rt *runtime) tea.Cmd {
	return func() tea.Msg {
		raw, err := fetchTokens(ctx, rt, "")
		if err != nil {
			return tuiTokensMsg{err: err}
		}
		out := make([]tuiToken, 0, len(raw))
		for _, tk := range raw {
			dec, _ := strconv.Atoi(getStr(tk, "decimals"))
			out = append(out, tuiToken{
				Chain: getStr(tk, "chainSymbol"), Symbol: getStr(tk, "symbol"),
				Address: getStr(tk, "tokenAddress"), Decimals: dec,
			})
		}
		sort.SliceStable(out, func(i, j int) bool {
			if out[i].Chain != out[j].Chain {
				return out[i].Chain < out[j].Chain
			}
			return out[i].Symbol < out[j].Symbol
		})
		return tuiTokensMsg{tokens: out}
	}
}

func tuiFetchQuote(ctx context.Context, rt *runtime, src, dst tuiToken, baseAmount string) tea.Cmd {
	return func() tea.Msg {
		q := url.Values{}
		q.Set("amount", baseAmount)
		q.Set("sourceToken", src.Address)
		q.Set("destinationToken", dst.Address)
		var raw json.RawMessage
		if err := rt.client.Get(ctx, "/bridge/quote", q, &raw); err != nil {
			return tuiQuoteMsg{err: err}
		}
		return tuiQuoteMsg{options: parseQuoteOptions(raw)}
	}
}

func tuiTick() tea.Cmd {
	return tea.Tick(120*time.Millisecond, func(t time.Time) tea.Msg { return tuiTickMsg(t) })
}

func parseQuoteOptions(raw json.RawMessage) []tuiOption {
	var q map[string]any
	if err := json.Unmarshal(raw, &q); err != nil {
		return nil
	}
	rawOpts, _ := q["options"].([]any)
	out := make([]tuiOption, 0, len(rawOpts))
	for _, ro := range rawOpts {
		opt, _ := ro.(map[string]any)
		o := tuiOption{Messenger: getStr(opt, "messenger"), EtaMs: getStr(opt, "estimatedTimeMs")}
		methods, _ := opt["paymentMethods"].([]any)
		for _, rm := range methods {
			pm, _ := rm.(map[string]any)
			o.Payments = append(o.Payments, tuiPayment{
				Method: getStr(pm, "feePaymentMethod"), Fee: getStr(pm, "fee"),
			})
			if est, ok := pm["estimatedAmount"].(map[string]any); ok && o.MinOut == "" {
				o.MinOut, o.MaxOut = getStr(est, "min"), getStr(est, "max")
			}
		}
		if len(o.Payments) > 0 {
			out = append(out, o)
		}
	}
	return out
}

func (m tuiModel) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.WindowSizeMsg:
		m.width, m.height = msg.Width, msg.Height
		return m, nil

	case tuiTickMsg:
		m.spinIdx++
		if m.loading || m.quoting {
			return m, tuiTick()
		}
		return m, nil

	case tuiTokensMsg:
		m.loading = false
		if msg.err != nil {
			m.err = msg.err.Error()
			return m, nil
		}
		m.tokens = msg.tokens
		if src, dst, ok := defaultRoute(msg.tokens); ok {
			m.sendToken, m.recvToken = src, dst
		}
		return m, nil

	case tuiQuoteMsg:
		m.quoting = false
		if msg.err != nil {
			m.err = msg.err.Error()
			return m, nil
		}
		m.options = msg.options
		m.quoted = len(m.options) > 0
		if len(m.options) > 0 {
			m.selectedMessenger = m.options[0].Messenger
			if len(m.options[0].Payments) > 0 {
				m.selectedFee = m.options[0].Payments[0].Method
			}
		}
		m.err = ""
		return m, nil

	case tea.KeyMsg:
		return m.handleKey(msg)
	}
	return m, nil
}

func (m tuiModel) handleKey(msg tea.KeyMsg) (tea.Model, tea.Cmd) {
	key := msg.String()

	if key == "ctrl+c" || key == "ctrl+q" {
		return m, tea.Quit
	}
	if url, ok := globalLinkForKey(key); ok {
		if err := openExternalLink(url); err != nil {
			m.err = err.Error()
			return m, nil
		}
		return m, nil
	}

	switch m.state {
	case statePicker:
		return m.handlePickerKey(key)
	}
	return m.handleFormKey(key)
}

func (m tuiModel) handleFormKey(key string) (tea.Model, tea.Cmd) {
	if d := focusFromJumpKey(key); d >= 0 {
		m.focus = d
		m.err = ""
		return m, nil
	}

	switch key {
	case "tab":
		m.focus = (m.focus + 1) % focusFieldCount
		return m, nil
	case "shift+tab":
		m.focus = (m.focus + focusFieldCount - 1) % focusFieldCount
		return m, nil
	case "enter":
		return m.handleFormEnter()
	case "q":
		if m.focus != focusRecipient {
			return m, tea.Quit
		}
	}

	switch m.focus {
	case focusSendAmount:
		switch key {
		case "backspace":
			if len(m.sendAmount) > 0 {
				m.sendAmount = m.sendAmount[:len(m.sendAmount)-1]
				m.quoted = false
			}
		default:
			if len(key) == 1 && strings.ContainsRune("0123456789.", []rune(key)[0]) {
				m.sendAmount += key
				m.quoted = false
			}
		}
	case focusRecipient:
		switch key {
		case "backspace":
			if len(m.recipient) > 0 {
				m.recipient = m.recipient[:len(m.recipient)-1]
			}
		default:
			if isPrintableAddrChar(key) {
				m.recipient += key
			}
		}
	case focusMessenger:
		if key == "up" || key == "k" {
			m.cycleMessenger(-1)
		}
		if key == "down" || key == "j" {
			m.cycleMessenger(+1)
		}
	case focusFeeMethod:
		if key == "up" || key == "k" {
			m.cycleFeeMethod(-1)
		}
		if key == "down" || key == "j" {
			m.cycleFeeMethod(+1)
		}
	}
	return m, nil
}

func (m tuiModel) handleFormEnter() (tea.Model, tea.Cmd) {
	switch m.focus {
	case focusSendAmount:
		if !validHumanAmount(m.sendAmount) {
			m.err = "amount must be a positive number (e.g. 100)"
			return m, nil
		}
		m.err = ""
		m.focus = focusSendToken

	case focusSendToken:
		m.openPicker(pickerSendToken)

	case focusReceiveToken:
		m.openPicker(pickerReceiveToken)

	case focusRecipient:
		if strings.TrimSpace(m.recipient) == "" {
			m.err = "recipient address cannot be empty"
			return m, nil
		}
		m.err = ""
		base, err := humanToBase(m.sendAmount, m.sendToken.Decimals)
		if err != nil {
			m.err = err.Error()
			return m, nil
		}
		m.quoting = true
		m.focus = focusMessenger
		return m, tea.Batch(tuiFetchQuote(m.ctx, m.rt, m.sendToken, m.recvToken, base), tuiTick())

	case focusMessenger:
		if !m.quoted {
			m.err = "wait for the quote to arrive"
			return m, nil
		}
		m.focus = focusFeeMethod

	case focusFeeMethod:
		if !m.quoted {
			m.err = "wait for the quote to arrive"
			return m, nil
		}
		m.focus = focusSend

	case focusSend:
		if !m.quoted {
			base, err := humanToBase(m.sendAmount, m.sendToken.Decimals)
			if err != nil {
				m.err = err.Error()
				return m, nil
			}
			m.quoting = true
			m.focus = focusMessenger
			return m, tea.Batch(tuiFetchQuote(m.ctx, m.rt, m.sendToken, m.recvToken, base), tuiTick())
		}
		if m.finalCmdOut != nil {
			*m.finalCmdOut = m.composeBridgeSend()
		}
		return m, tea.Quit
	}
	return m, nil
}

func (m *tuiModel) openPicker(kind pickerKind) {
	m.state = statePicker
	m.picker = kind
	m.pickerCursor = 0
	m.pickerOffset = 0
	m.pickerChain = ""
	m.pickerSearch = ""
}

func (m *tuiModel) cycleMessenger(dir int) {
	if len(m.options) == 0 {
		return
	}
	idx := 0
	for i, o := range m.options {
		if o.Messenger == m.selectedMessenger {
			idx = i
			break
		}
	}
	idx = (idx + dir + len(m.options)) % len(m.options)
	m.selectedMessenger = m.options[idx].Messenger
	if len(m.options[idx].Payments) > 0 {
		m.selectedFee = m.options[idx].Payments[0].Method
	}
}

func (m *tuiModel) cycleFeeMethod(dir int) {
	opt := m.optionByMessenger(m.selectedMessenger)
	if len(opt.Payments) == 0 {
		return
	}
	idx := 0
	for i, p := range opt.Payments {
		if p.Method == m.selectedFee {
			idx = i
			break
		}
	}
	idx = (idx + dir + len(opt.Payments)) % len(opt.Payments)
	m.selectedFee = opt.Payments[idx].Method
}

func (m tuiModel) composeBridgeSend() string {
	base, _ := humanToBase(m.sendAmount, m.sendToken.Decimals)
	return fmt.Sprintf(`allbridge bridge send \
    --from %s:%s \
    --to %s:%s \
    --amount %s \
    --recipient %s \
    --messenger %s \
    --fee-method %s \
    --approve`,
		m.sendToken.Chain, m.sendToken.Symbol,
		m.recvToken.Chain, m.recvToken.Symbol,
		base,
		m.recipient,
		m.selectedMessenger,
		m.selectedFee,
	)
}

func focusFromJumpKey(key string) focusField {
	switch key {
	case "ctrl+1":
		return focusSendAmount
	case "ctrl+2":
		return focusSendToken
	case "ctrl+3":
		return focusReceiveToken
	case "ctrl+4":
		return focusRecipient
	case "ctrl+5":
		return focusMessenger
	case "ctrl+6":
		return focusFeeMethod
	case "ctrl+7":
		return focusSend
	}
	return -1
}

func (m tuiModel) handlePickerKey(key string) (tea.Model, tea.Cmd) {
	chains := append([]string{""}, chainList(m.tokens)...)
	items := m.pickerItems()

	switch key {
	case "esc":
		m.state = stateForm
		m.picker = pickerNone
		return m, nil

	case "left", "h":
		idx := m.chainIndex(chains)
		idx = (idx + len(chains) - 1) % len(chains)
		m.pickerChain = chains[idx]
		m.pickerCursor = 0
		m.pickerOffset = 0
		return m, nil

	case "right", "l":
		idx := m.chainIndex(chains)
		idx = (idx + 1) % len(chains)
		m.pickerChain = chains[idx]
		m.pickerCursor = 0
		m.pickerOffset = 0
		return m, nil

	case "up", "k":
		if m.pickerCursor > 0 {
			m.pickerCursor--
		}

	case "down", "j":
		if m.pickerCursor < len(items)-1 {
			m.pickerCursor++
		}

	case "pgup":
		m.pickerCursor -= pickerVisibleRows
		if m.pickerCursor < 0 {
			m.pickerCursor = 0
		}

	case "pgdown":
		m.pickerCursor += pickerVisibleRows
		if m.pickerCursor >= len(items) {
			m.pickerCursor = len(items) - 1
		}

	case "home", "g":
		m.pickerCursor = 0

	case "end", "G":
		if len(items) > 0 {
			m.pickerCursor = len(items) - 1
		}

	case "enter":
		if m.pickerCursor >= 0 && m.pickerCursor < len(items) {
			tk := items[m.pickerCursor]
			switch m.picker {
			case pickerSendToken:
				m.sendToken = tk
				m.state = stateForm
				m.picker = pickerNone
				m.focus = focusReceiveToken
				m.quoted = false
			case pickerReceiveToken:
				m.recvToken = tk
				m.state = stateForm
				m.picker = pickerNone
				m.focus = focusRecipient
				m.quoted = false
			}
		}
		return m, nil

	case "backspace":
		if len(m.pickerSearch) > 0 {
			m.pickerSearch = m.pickerSearch[:len(m.pickerSearch)-1]
			m.pickerCursor = 0
		}

	default:
		if len(key) == 1 {
			c := key[0]
			if (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') {
				m.pickerSearch += strings.ToLower(key)
				m.pickerCursor = 0
			}
		}
	}

	if m.pickerCursor < m.pickerOffset {
		m.pickerOffset = m.pickerCursor
	} else if m.pickerCursor >= m.pickerOffset+pickerVisibleRows {
		m.pickerOffset = m.pickerCursor - pickerVisibleRows + 1
	}
	return m, nil
}

func (m tuiModel) chainIndex(chains []string) int {
	for i, c := range chains {
		if c == m.pickerChain {
			return i
		}
	}
	return 0
}

func (m tuiModel) pickerItems() []tuiToken {
	out := make([]tuiToken, 0, len(m.tokens))
	q := strings.ToLower(m.pickerSearch)
	for _, tk := range m.tokens {
		if m.pickerChain != "" && tk.Chain != m.pickerChain {
			continue
		}
		if q != "" {
			hay := strings.ToLower(tk.Chain + " " + tk.Symbol + " " + tk.Address)
			if !strings.Contains(hay, q) {
				continue
			}
		}
		if m.picker == pickerSendToken && tk.Address == m.recvToken.Address && tk.Chain == m.recvToken.Chain {
			continue
		}
		if m.picker == pickerReceiveToken && tk.Address == m.sendToken.Address && tk.Chain == m.sendToken.Chain {
			continue
		}
		out = append(out, tk)
	}
	return out
}

func (m tuiModel) View() string {
	st := tuiStyles(!m.rt.flags.noColor)
	if m.width == 0 {
		m.width = 120
	}
	if m.state == statePicker {
		return m.viewPicker(st)
	}
	return m.viewForm(st)
}

func (m tuiModel) viewForm(s styles) string {
	var b strings.Builder
	b.WriteString(m.renderTopBar(s))
	b.WriteString("\n\n")
	if m.loading {
		b.WriteString(s.dim.Render("  " + spinnerFrame(m.spinIdx) + " loading supported chains and tokens…"))
	} else {
		left := m.renderForm(s)
		right := m.renderDetails(s)
		b.WriteString(lipgloss.JoinHorizontal(lipgloss.Top, left, "  ", right))
	}
	b.WriteString("\n")
	b.WriteString(m.renderHint(s))
	b.WriteString("\n")
	b.WriteString(m.renderFooter(s))
	return b.String()
}

func (m tuiModel) viewPicker(s styles) string {
	var b strings.Builder
	b.WriteString(m.renderTopBar(s))
	b.WriteString("\n\n")
	b.WriteString(m.renderPicker(s))
	b.WriteString("\n")
	b.WriteString(m.renderFooter(s))
	return b.String()
}

func (m tuiModel) renderTopBar(s styles) string {
	v := version.Version
	if v == "" {
		v = "dev"
	}
	wallet := m.walletName
	if wallet == "" {
		wallet = "no wallet"
	}
	left := s.brand.Render("ALLBRIDGE") + s.dim.Render("  Swap")
	right := s.dim.Render(fmt.Sprintf("wallet: %s   ·   %s", wallet, v))
	pad := m.width - lipgloss.Width(left) - lipgloss.Width(right)
	if pad < 2 {
		pad = 2
	}
	return left + strings.Repeat(" ", pad) + right
}

func (m tuiModel) renderForm(s styles) string {
	width := m.width/2 - 4
	if width < 50 {
		width = 50
	}
	innerW := width - 6 // panel padding (2) + card border (2) + slack (2)

	amtVisible := m.sendAmount
	if amtVisible == "" {
		amtVisible = "0.0"
	}
	if m.focus == focusSendAmount {
		amtVisible = s.input.Render(amtVisible + "▮")
	} else {
		amtVisible = s.amount.Render(amtVisible)
	}
	amtBox := m.box(s, focusSendAmount, innerW, "  "+amtVisible+"   "+s.dim.Render(m.sendToken.Symbol))

	sendChip := m.tokenChip(s, m.sendToken, m.focus == focusSendToken, "select source")
	recvChip := m.tokenChip(s, m.recvToken, m.focus == focusReceiveToken, "select destination")

	recvAmt := "0.0"
	if opt := m.optionByMessenger(m.selectedMessenger); opt.MinOut != "" && m.recvToken.Decimals > 0 {
		recvAmt = baseToHuman(opt.MinOut, m.recvToken.Decimals)
	}

	rcptValue := m.recipient
	switch {
	case rcptValue == "" && m.focus != focusRecipient:
		rcptValue = s.placeholder.Render("paste destination address…")
	case m.focus == focusRecipient:
		rcptValue = s.input.Render(m.recipient + "▮")
		if m.recipient == "" {
			rcptValue = s.input.Render("▮")
		}
	default:
		rcptValue = s.normal.Render(m.recipient)
	}
	rcptBox := m.box(s, focusRecipient, innerW, "  "+rcptValue)

	btnLabel := "Print command"
	switch {
	case m.quoting:
		btnLabel = "… quoting"
	case !m.quoted:
		btnLabel = "Get quote"
	}
	btn := s.button.Render("  " + btnLabel + "  ")
	if m.focus == focusSend {
		btn = s.buttonActive.Render("  " + btnLabel + "  ")
	}

	parts := []string{
		m.stepLabel(s, 1, focusSendAmount, "You send"),
		amtBox,
		"",
		m.stepLabel(s, 2, focusSendToken, "Source token"),
		"" + sendChip,
		"",
		m.stepLabel(s, 3, focusReceiveToken, "Destination token") + s.dim.Render("    receive ≥ "+recvAmt+" "+m.recvToken.Symbol),
		"" + recvChip,
		"",
		m.stepLabel(s, 4, focusRecipient, "Recipient address on "+chainOrPlaceholder(m.recvToken.Chain)),
		rcptBox,
		"",
		"" + btn,
	}
	return s.panel.Width(width).Render(s.panelTitle.Render("SWAP") + "\n" + strings.Join(parts, "\n"))
}

func (m tuiModel) renderDetails(s styles) string {
	width := m.width - (m.width/2 - 4) - 6
	if width < 40 {
		width = 40
	}
	var b strings.Builder
	b.WriteString(s.panelTitle.Render("DETAILS"))
	b.WriteString("\n\n")

	src := tokenLabel(m.sendToken)
	dst := tokenLabel(m.recvToken)
	b.WriteString("  " + s.normal.Render(src) + s.dim.Render("  ──────►  ") + s.normal.Render(dst) + "\n\n")

	if m.quoting {
		b.WriteString("  " + spinnerFrame(m.spinIdx) + " " + s.dim.Render("waiting for /bridge/quote …") + "\n")
	} else if !m.quoted {
		b.WriteString("  " + s.dim.Render("Quote runs after step [4] (recipient).") + "\n")
	} else {
		opt := m.optionByMessenger(m.selectedMessenger)
		b.WriteString("  " + s.cardLabel.Render("ETA       ") + formatEtaMs(opt.EtaMs) + "\n")
		if opt.MinOut != "" {
			b.WriteString("  " + s.cardLabel.Render("Receive ≥ ") +
				baseToHuman(opt.MinOut, m.recvToken.Decimals) + " " + m.recvToken.Symbol + "\n")
		}
	}
	b.WriteString("\n")

	b.WriteString(m.stepLabel(s, 5, focusMessenger, "Messenger") + "\n")
	if !m.quoted {
		b.WriteString("  " + s.dim.Render("(no options yet)") + "\n")
	}
	for _, o := range m.options {
		marker := "  ○  "
		if o.Messenger == m.selectedMessenger {
			marker = s.accent.Render("  ●  ")
		}
		line := marker + o.Messenger + s.dim.Render("   ETA "+formatEtaMs(o.EtaMs))
		b.WriteString(line + "\n")
	}
	b.WriteString("\n")

	b.WriteString(m.stepLabel(s, 6, focusFeeMethod, "Pay fee in") + "\n")
	if !m.quoted {
		b.WriteString("  " + s.dim.Render("(no methods yet)") + "\n")
	} else {
		opt := m.optionByMessenger(m.selectedMessenger)
		for _, p := range opt.Payments {
			marker := "  ○  "
			if p.Method == m.selectedFee {
				marker = s.accent.Render("  ●  ")
			}
			dec, unit := paymentUnit(p.Method, m.sendToken.Chain, m.sendToken)
			line := marker + p.Method + s.dim.Render("   fee "+baseToHuman(p.Fee, dec)+" "+unit)
			b.WriteString(line + "\n")
		}
	}

	if m.err != "" {
		b.WriteString("\n" + s.err.Render("  ⚠ "+m.err) + "\n")
	}
	return s.panel.Width(width).Render(b.String())
}

func (m tuiModel) renderPicker(s styles) string {
	width := m.width - 4

	var b strings.Builder
	title := "Select source token"
	if m.picker == pickerReceiveToken {
		title = "Select destination token"
	}
	b.WriteString(s.panelTitle.Render(title) + "  " + s.dim.Render("[esc] back   [←→] chain   [a-z 0-9] search   [enter] pick"))
	b.WriteString("\n\n")

	chains := append([]string{"All"}, chainList(m.tokens)...)
	chipsRow := s.cardLabel.Render("Chain  ")
	for i, c := range chains {
		raw := c
		on := (c == "All" && m.pickerChain == "") || (c != "All" && c == m.pickerChain)
		if on {
			chipsRow += s.chainChipActive.Render(raw)
		} else {
			chipsRow += s.chainChip.Render(raw)
		}
		if i < len(chains)-1 {
			chipsRow += s.dim.Render(" · ")
		}
	}
	b.WriteString(chipsRow + "\n\n")

	searchVal := m.pickerSearch
	if searchVal == "" {
		searchVal = s.placeholder.Render("type to filter (e.g. usdt, 0xabc…)")
	} else {
		searchVal = s.input.Render(m.pickerSearch + "▮")
	}
	b.WriteString(s.cardLabel.Render("Search ") + searchVal + "\n\n")

	items := m.pickerItems()
	end := m.pickerOffset + pickerVisibleRows
	if end > len(items) {
		end = len(items)
	}
	for i := m.pickerOffset; i < end; i++ {
		tk := items[i]
		row := fmt.Sprintf("%-5s %-7s %s", tk.Chain, tk.Symbol, tk.Address)
		if i == m.pickerCursor {
			b.WriteString(s.selected.Render("  ▸ "+row) + "\n")
		} else {
			b.WriteString("    " + s.normal.Render(row) + "\n")
		}
	}
	for i := end - m.pickerOffset; i < pickerVisibleRows; i++ {
		b.WriteString("\n")
	}
	if len(items) == 0 {
		b.WriteString(s.dim.Render("  no tokens match this filter") + "\n")
	} else {
		b.WriteString(s.dim.Render(fmt.Sprintf("  [%d / %d]", m.pickerCursor+1, len(items))) + "\n")
	}
	return s.panel.Width(width).Render(b.String())
}

func (m tuiModel) renderHint(s styles) string {
	return s.hint.Render("  " + m.hintText())
}

func (m tuiModel) hintText() string {
	if m.loading {
		return "Loading…"
	}
	switch m.focus {
	case focusSendAmount:
		return "Now: type the amount in human units (e.g. 100), then press Enter."
	case focusSendToken:
		return "Now: press Enter to open the source token picker."
	case focusReceiveToken:
		return "Now: press Enter to open the destination token picker."
	case focusRecipient:
		return "Now: paste / type the recipient address on the destination chain, then Enter."
	case focusMessenger:
		if !m.quoted {
			return "Now: waiting for the live quote…"
		}
		return "Now: ↑↓ to choose a messenger, then Enter."
	case focusFeeMethod:
		return "Now: ↑↓ to choose how you want to pay the fee, then Enter."
	case focusSend:
		return "Now: press Enter to print the ready-to-run command and exit."
	}
	return ""
}

func (m tuiModel) renderFooter(s styles) string {
	if m.state == statePicker {
		return s.dim.Render("  ←→ chain  ·  ↑↓ navigate  ·  type to filter  ·  enter pick  ·  esc back  ·  ctrl-c quit") +
			"\n" + s.dim.Render("  ctrl+o site  ·  ctrl+d docs  ·  ctrl+g github")
	}
	keys := []string{
		"tab next", "shift-tab prev",
		"ctrl+1..7 jump", "enter confirm",
		"↑↓ navigate", "ctrl-c quit",
	}
	links := "Allbridge Core: " + s.linkColor.Render("core.allbridge.io") +
		"  ·  " + s.linkColor.Render("docs-core.allbridge.io") +
		"  ·  " + s.linkColor.Render("github.com/allbridge-io")
	return s.dim.Render("  "+strings.Join(keys, "  ·  ")) +
		"\n" + s.dim.Render("  ctrl+o site  ·  ctrl+d docs  ·  ctrl+g github") +
		"\n" + s.dim.Render("  "+links)
}

func (m tuiModel) stepLabel(s styles, n int, f focusField, title string) string {
	badge := s.stepBadge.Render(strconv.Itoa(n))
	titleStyle := s.cardLabel
	if m.focus == f {
		badge = s.stepBadgeActive.Render(strconv.Itoa(n))
		titleStyle = s.accent
	}
	return badge + " " + titleStyle.Render(title)
}

func (m tuiModel) box(s styles, f focusField, width int, body string) string {
	style := s.card
	if m.focus == f {
		style = s.cardActive
	}
	return style.Width(width).Render(body)
}

func (m tuiModel) tokenChip(s styles, t tuiToken, focused bool, fallback string) string {
	label := tokenLabel(t)
	if t.Chain == "" {
		label = fallback
	}
	width := lipgloss.Width(" " + label + "  ↵ ")
	if width < 18 {
		width = 18
	}
	style := s.tokenChip.Width(width)
	if focused {
		style = s.tokenChipActive.Width(width)
	}
	return style.Render(" " + label + "  ↵ ")
}

func (m tuiModel) optionByMessenger(name string) tuiOption {
	for _, o := range m.options {
		if o.Messenger == name {
			return o
		}
	}
	if len(m.options) > 0 {
		return m.options[0]
	}
	return tuiOption{}
}

func tokenLabel(t tuiToken) string {
	if t.Chain == "" {
		return "—"
	}
	return t.Chain + " : " + t.Symbol
}

func chainOrPlaceholder(c string) string {
	if c == "" {
		return "destination chain"
	}
	return c
}

func chainList(tokens []tuiToken) []string {
	seen := map[string]struct{}{}
	out := []string{}
	for _, tk := range tokens {
		if _, ok := seen[tk.Chain]; ok {
			continue
		}
		seen[tk.Chain] = struct{}{}
		out = append(out, tk.Chain)
	}
	sort.Strings(out)
	return out
}

func defaultRoute(tokens []tuiToken) (tuiToken, tuiToken, bool) {
	var src, dst tuiToken
	srcOK, dstOK := false, false
	for _, tk := range tokens {
		if !srcOK && tk.Chain == "ETH" && tk.Symbol == "USDT" {
			src, srcOK = tk, true
		}
		if !dstOK && tk.Chain == "TRX" && tk.Symbol == "USDT" {
			dst, dstOK = tk, true
		}
	}
	if !srcOK && len(tokens) > 0 {
		src, srcOK = tokens[0], true
	}
	if !dstOK {
		for _, tk := range tokens {
			if tk.Chain != src.Chain && tk.Symbol == src.Symbol {
				dst, dstOK = tk, true
				break
			}
		}
	}
	return src, dst, srcOK && dstOK
}

func paymentUnit(method, srcChain string, srcToken tuiToken) (int, string) {
	switch method {
	case "WITH_STABLECOIN":
		return srcToken.Decimals, srcToken.Symbol
	case "WITH_ABR":
		return 18, "ABR"
	case "WITH_NATIVE_CURRENCY":
		return nativeDecimals(srcChain), nativeSymbol(srcChain)
	}
	return srcToken.Decimals, srcToken.Symbol
}

func nativeDecimals(chain string) int {
	switch strings.ToUpper(chain) {
	case "SOL", "SUI":
		return 9
	case "TRX", "ALG", "STX":
		return 6
	case "STLR", "SRB":
		return 7
	}
	return 18
}

func nativeSymbol(chain string) string {
	switch strings.ToUpper(chain) {
	case "ETH", "ARB", "OPT", "BASE", "BAS", "LIN", "UNI":
		return "ETH"
	case "BSC":
		return "BNB"
	case "POL":
		return "POL"
	case "AVA":
		return "AVAX"
	case "CELO", "CEL":
		return "CELO"
	case "SONIC", "SNC":
		return "S"
	case "SOL":
		return "SOL"
	case "TRX":
		return "TRX"
	case "STLR", "SRB":
		return "XLM"
	case "ALG":
		return "ALGO"
	case "SUI":
		return "SUI"
	case "STX":
		return "STX"
	}
	return strings.ToUpper(chain)
}

func formatEtaMs(s string) string {
	if s == "" {
		return ""
	}
	n, err := strconv.ParseInt(s, 10, 64)
	if err != nil || n <= 0 {
		return s + " ms"
	}
	d := time.Duration(n) * time.Millisecond
	switch {
	case d < time.Second:
		return fmt.Sprintf("%dms", n)
	case d < time.Minute:
		return fmt.Sprintf("%ds", int(d.Seconds()))
	case d < time.Hour:
		mn, sec := int(d.Minutes()), int(d.Seconds())%60
		if sec == 0 {
			return fmt.Sprintf("%dm", mn)
		}
		return fmt.Sprintf("%dm %ds", mn, sec)
	default:
		h, mn := int(d.Hours()), int(d.Minutes())%60
		return fmt.Sprintf("%dh %dm", h, mn)
	}
}

func spinnerFrame(i int) string {
	frames := []string{"⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"}
	return frames[i%len(frames)]
}

func validHumanAmount(s string) bool {
	if s == "" || s == "." {
		return false
	}
	dots := 0
	for _, r := range s {
		if r == '.' {
			dots++
			if dots > 1 {
				return false
			}
			continue
		}
		if r < '0' || r > '9' {
			return false
		}
	}
	return strings.Trim(s, "0.") != ""
}

func humanToBase(human string, decimals int) (string, error) {
	if !validHumanAmount(human) {
		return "", fmt.Errorf("invalid amount: %q", human)
	}
	parts := strings.SplitN(human, ".", 2)
	intPart, frac := parts[0], ""
	if len(parts) == 2 {
		frac = parts[1]
	}
	if len(frac) > decimals {
		frac = frac[:decimals]
	} else if len(frac) < decimals {
		frac += strings.Repeat("0", decimals-len(frac))
	}
	combined := strings.TrimLeft(intPart+frac, "0")
	if combined == "" {
		combined = "0"
	}
	return combined, nil
}

func baseToHuman(base string, decimals int) string {
	if base == "" || decimals <= 0 {
		return base
	}
	if len(base) <= decimals {
		base = strings.Repeat("0", decimals-len(base)+1) + base
	}
	cut := len(base) - decimals
	intPart, frac := base[:cut], base[cut:]
	frac = strings.TrimRight(frac, "0")
	if frac == "" {
		return intPart
	}
	return intPart + "." + frac
}

func isPrintableAddrChar(key string) bool {
	if len(key) != 1 {
		return false
	}
	c := key[0]
	return (c >= '0' && c <= '9') ||
		(c >= 'a' && c <= 'z') ||
		(c >= 'A' && c <= 'Z') ||
		c == ':' || c == '_' || c == '-' || c == '/' || c == '.'
}

type styles struct {
	brand           lipgloss.Style
	panel           lipgloss.Style
	panelTitle      lipgloss.Style
	card            lipgloss.Style
	cardActive      lipgloss.Style
	cardLabel       lipgloss.Style
	stepBadge       lipgloss.Style
	stepBadgeActive lipgloss.Style
	tokenChip       lipgloss.Style
	tokenChipActive lipgloss.Style
	chainChip       lipgloss.Style
	chainChipActive lipgloss.Style
	button          lipgloss.Style
	buttonActive    lipgloss.Style
	dim             lipgloss.Style
	normal          lipgloss.Style
	selected        lipgloss.Style
	accent          lipgloss.Style
	amount          lipgloss.Style
	input           lipgloss.Style
	placeholder     lipgloss.Style
	err             lipgloss.Style
	hint            lipgloss.Style
	linkColor       lipgloss.Style
}

func tuiStyles(color bool) styles {
	if !color {
		p := lipgloss.NewStyle()
		return styles{
			brand: p.Bold(true), panel: p.Padding(1, 2),
			panelTitle: p.Bold(true).Underline(true),
			card:       p.Border(lipgloss.NormalBorder()).Padding(0, 1),
			cardActive: p.Bold(true).Border(lipgloss.NormalBorder()).Padding(0, 1),
			cardLabel:  p, stepBadge: p.Border(lipgloss.NormalBorder()).Padding(0, 1),
			stepBadgeActive: p.Bold(true).Reverse(true).Border(lipgloss.NormalBorder()).Padding(0, 1),
			tokenChip:       p.Border(lipgloss.RoundedBorder()),
			tokenChipActive: p.Bold(true).Border(lipgloss.RoundedBorder()),
			chainChip:       p, chainChipActive: p.Bold(true).Reverse(true),
			button:       p.Border(lipgloss.RoundedBorder()),
			buttonActive: p.Reverse(true).Border(lipgloss.RoundedBorder()),
			dim:          p, normal: p, selected: p.Reverse(true), accent: p.Bold(true),
			amount: p.Bold(true), input: p.Underline(true), placeholder: p, err: p.Bold(true),
			hint: p.Italic(true), linkColor: p.Underline(true),
		}
	}

	cAccent := lipgloss.Color("#06B6D4")  // cyan
	cAccent2 := lipgloss.Color("#A78BFA") // violet
	cText := lipgloss.Color("#E2E8F0")
	cDim := lipgloss.Color("#64748B")
	cMute := lipgloss.Color("#94A3B8")
	cBorder := lipgloss.Color("#1E293B")
	cBorderCard := lipgloss.Color("#334155")
	cGood := lipgloss.Color("#22C55E")
	cWarn := lipgloss.Color("#EF4444")
	cBgPanel := lipgloss.Color("#0B1220")

	return styles{
		brand: lipgloss.NewStyle().Foreground(cAccent).Bold(true),
		panel: lipgloss.NewStyle().
			Border(lipgloss.RoundedBorder()).BorderForeground(cBorder).
			Background(cBgPanel).Padding(1, 2),
		panelTitle: lipgloss.NewStyle().Foreground(cMute).Bold(true),
		card:       lipgloss.NewStyle().Border(lipgloss.NormalBorder()).BorderForeground(cBorderCard).Padding(0, 1),
		cardActive: lipgloss.NewStyle().Border(lipgloss.NormalBorder()).BorderForeground(cAccent).Padding(0, 1),
		cardLabel:  lipgloss.NewStyle().Foreground(cMute),
		stepBadge: lipgloss.NewStyle().
			Foreground(cMute).Border(lipgloss.NormalBorder()).BorderForeground(cBorderCard).Padding(0, 1),
		stepBadgeActive: lipgloss.NewStyle().
			Foreground(cAccent).Bold(true).
			Border(lipgloss.NormalBorder()).BorderForeground(cAccent).Padding(0, 1),
		tokenChip: lipgloss.NewStyle().
			Foreground(cText).Border(lipgloss.RoundedBorder()).BorderForeground(cBorderCard),
		tokenChipActive: lipgloss.NewStyle().
			Foreground(cAccent).Bold(true).Border(lipgloss.RoundedBorder()).BorderForeground(cAccent),
		chainChip:       lipgloss.NewStyle().Foreground(cMute),
		chainChipActive: lipgloss.NewStyle().Foreground(cAccent).Bold(true).Underline(true),
		button: lipgloss.NewStyle().
			Foreground(cText).Border(lipgloss.RoundedBorder()).BorderForeground(cBorderCard),
		buttonActive: lipgloss.NewStyle().
			Foreground(lipgloss.Color("#020617")).Background(cAccent).Bold(true).
			Border(lipgloss.RoundedBorder()).BorderForeground(cAccent),
		dim:         lipgloss.NewStyle().Foreground(cDim),
		normal:      lipgloss.NewStyle().Foreground(cText),
		selected:    lipgloss.NewStyle().Foreground(lipgloss.Color("#020617")).Background(cAccent).Bold(true),
		accent:      lipgloss.NewStyle().Foreground(cAccent).Bold(true),
		amount:      lipgloss.NewStyle().Foreground(cAccent2).Bold(true),
		input:       lipgloss.NewStyle().Foreground(cGood).Bold(true),
		placeholder: lipgloss.NewStyle().Foreground(cDim).Italic(true),
		err:         lipgloss.NewStyle().Foreground(cWarn).Bold(true),
		hint:        lipgloss.NewStyle().Foreground(cAccent).Italic(true),
		linkColor:   lipgloss.NewStyle().Foreground(cAccent).Underline(true),
	}
}
