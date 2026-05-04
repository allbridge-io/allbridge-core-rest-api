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

	"github.com/allbridge-io/rest-api/cli/internal/next"
	"github.com/allbridge-io/rest-api/cli/internal/version"
	"github.com/allbridge-io/rest-api/cli/internal/wallet"
)

type uiState int

const (
	stateForm uiState = iota
	statePicker
	stateExec // full-screen exec lifecycle (mode in m.execMode)
)

// execMode tracks where the user is in the post-quote execution flow.
// Empty string means the user hasn't pressed Execute yet (form is in
// "edit" mode); the rest of the lifecycle replaces the button row at the
// bottom of the form panel without leaving the dashboard.
type execMode string

const (
	execIdle       execMode = ""           // two buttons: [Execute] [Print]
	execAsk        execMode = "passphrase" // inline secret input
	execRun        execMode = "running"    // phase widget
	execDone       execMode = "done"       // result + [T]rack / [N]ew / [Q]uit
	execFailed     execMode = "error"      // error + [N]ew / [Q]uit
	execTracking   execMode = "tracking"   // post-done: poll transfer status
)

type focusField int

const (
	focusSendAmount focusField = iota
	focusSendToken
	focusReceiveToken
	focusWallet
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
	pickerWallet // shared picker UI; m.walletPickerPurpose decides where the address goes
)

type walletPickerPurpose int

const (
	pickForSender walletPickerPurpose = iota
	pickForRecipient
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

// tuiNextRoute is the NEXT-flavour route summary the TUI renders when
// `api == apiNext`. NEXT doesn't expose payment-method × messenger as a
// matrix — it's a flat list of routes, each with one relayer-fee entry,
// so we just collapse the relevant fields here.
type tuiNextRoute struct {
	Messenger    string
	AmountOut    string // base units (destination decimals)
	EstSeconds   int
	FeeAmount    string // base units in payment-token precision
	FeeTokenID   string // "native" | <tokenId>
	NeedsApprove bool
}

type tuiTokensMsg struct {
	tokens []tuiToken
	api    apiKind // which API the result came from, for stale-response guard
	err    error
}
type tuiQuoteMsg struct {
	options    []tuiOption    // populated when api==apiCore
	nextRoutes []tuiNextRoute // populated when api==apiNext
	api        apiKind
	err        error
}
type tuiTickMsg time.Time

// tuiExecProgressMsg is one Progress event surfaced from the send
// pipeline goroutine into the Bubble Tea event loop.
type tuiExecProgressMsg struct{ p Progress }

// tuiExecDoneMsg signals the pipeline goroutine has returned (success or
// failure). result/src/dst are nil on early failures (e.g. wallet load).
type tuiExecDoneMsg struct {
	result *nextSendResult
	src    *next.Token
	dst    *next.Token
	err    error
}

// tuiTrackTickMsg fires every few seconds while we're polling delivery
// status. We don't reuse tuiTickMsg because that one's bound to the
// 120ms spinner cadence — too aggressive for /transfer/status calls.
type tuiTrackTickMsg time.Time

// tuiTrackStatusMsg carries one polled status update.
type tuiTrackStatusMsg struct {
	status *next.TxStatus
	err    error
}

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

	api               apiKind // toggled via Ctrl+A; defaults to apiCore
	options           []tuiOption    // apiCore quotes
	nextRoutes        []tuiNextRoute // apiNext quotes
	selectedMessenger string
	selectedFee       string
	selectedNextIdx   int // index into nextRoutes

	picker       pickerKind
	pickerCursor int
	pickerOffset int
	pickerChain  string // "" = "All"
	pickerSearch string

	walletName          string
	wallets             []walletRef // loaded once at init; Ctrl+W cycles
	walletIdx           int
	walletPickerPurpose walletPickerPurpose

	// Exec flow state — replaces the bottom button row of the form when
	// non-idle. `mode` is the FSM, the rest is per-mode scratch.
	execMode       execMode
	execPassphrase string        // hidden input; rendered as • to the screen
	execPhases     []execPhase   // append-only event log driving the render
	execProgressCh chan Progress // pipeline emissions (TUI side)
	execResult     *nextSendResult
	execSrc        *next.Token
	execDst        *next.Token
	execErr        error
	sendBtnIdx     int // 0 = Execute, 1 = Print — only meaningful in execIdle

	// Track-delivery state — populated when the user opts into post-send
	// status polling.
	trackStatus     *next.TxStatus
	trackErr        error
	trackTickActive bool

	finalCmdOut *string
}

// execPhase is one observable phase event the TUI tracks for rendering.
// The append-only log lets us show "preflight ✓ → quote ✓ → build ⠴ …"
// without recomputing state from a flat status map.
type execPhase struct {
	id          PhaseID
	status      PhaseStatus
	note        string
	hash        string
	explorerURL string
	err         error
}

// walletRef is the slim view of a keystore entry the TUI keeps in memory
// to drive the Ctrl+W cycler — name + family + address are all the
// dashboard needs to render and emit `--wallet <name>` correctly.
type walletRef struct {
	Name    string
	Family  string
	Address string
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
	// Load the keystore once up front so Ctrl+W has something to cycle.
	// Failure here is non-fatal — TUI still works without a wallet (the
	// composed command just won't include --wallet).
	if st, err := wallet.Load(); err == nil {
		for _, name := range st.Names() {
			e := st.Entries[name]
			m.wallets = append(m.wallets, walletRef{
				Name: e.Name, Family: string(e.Family), Address: e.Address,
			})
			if e.Name == m.walletName {
				m.walletIdx = len(m.wallets) - 1
			}
		}
		// If config has no default but there is at least one wallet, pick
		// the first so the user sees a real value in the top bar.
		if m.walletName == "" && len(m.wallets) > 0 {
			m.walletName = m.wallets[0].Name
		}
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
	return tea.Batch(tuiFetchTokens(m.ctx, m.rt, m.api), tuiTick())
}

func tuiFetchTokens(ctx context.Context, rt *runtime, api apiKind) tea.Cmd {
	return func() tea.Msg {
		if api == apiNext {
			toks, err := rt.nextClient.Tokens(ctx)
			if err != nil {
				return tuiTokensMsg{api: api, err: err}
			}
			out := make([]tuiToken, 0, len(toks))
			for _, t := range toks {
				out = append(out, tuiToken{
					Chain: t.Chain, Symbol: t.Symbol,
					// We stash the NEXT tokenId in Address so picker keys
					// stay unique (some chains expose the same symbol on
					// CCTP and Allbridge messengers under different IDs).
					Address: t.TokenID, Decimals: t.Decimals,
				})
			}
			sort.SliceStable(out, func(i, j int) bool {
				if out[i].Chain != out[j].Chain {
					return out[i].Chain < out[j].Chain
				}
				return out[i].Symbol < out[j].Symbol
			})
			return tuiTokensMsg{tokens: out, api: api}
		}
		raw, err := fetchTokens(ctx, rt, "")
		if err != nil {
			return tuiTokensMsg{api: api, err: err}
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
		return tuiTokensMsg{tokens: out, api: api}
	}
}

func tuiFetchQuote(ctx context.Context, rt *runtime, api apiKind, src, dst tuiToken, baseAmount string) tea.Cmd {
	return func() tea.Msg {
		if api == apiNext {
			routes, err := rt.nextClient.Quote(ctx, next.QuoteRequest{
				Amount:             baseAmount,
				SourceTokenID:      src.Address, // tokenId stored as Address
				DestinationTokenID: dst.Address,
			})
			if err != nil {
				return tuiQuoteMsg{api: api, err: err}
			}
			out := make([]tuiNextRoute, 0, len(routes))
			for _, r := range routes {
				row := tuiNextRoute{
					Messenger:  r.Messenger,
					AmountOut:  r.AmountOut,
					EstSeconds: r.EstimatedTime,
				}
				if len(r.RelayerFees) > 0 {
					f := r.RelayerFees[0]
					for i := range r.RelayerFees {
						// prefer "native" if present
						if r.RelayerFees[i].TokenID == "native" {
							f = r.RelayerFees[i]
							break
						}
					}
					row.FeeAmount = f.Amount
					row.FeeTokenID = f.TokenID
					row.NeedsApprove = f.ApprovalSpender != ""
				}
				out = append(out, row)
			}
			return tuiQuoteMsg{nextRoutes: out, api: api}
		}
		q := url.Values{}
		q.Set("amount", baseAmount)
		q.Set("sourceToken", src.Address)
		q.Set("destinationToken", dst.Address)
		var raw json.RawMessage
		if err := rt.client.Get(ctx, "/bridge/quote", q, &raw); err != nil {
			return tuiQuoteMsg{api: api, err: err}
		}
		return tuiQuoteMsg{options: parseQuoteOptions(raw), api: api}
	}
}

func tuiTick() tea.Cmd {
	return tea.Tick(120*time.Millisecond, func(t time.Time) tea.Msg { return tuiTickMsg(t) })
}

// tuiExecBridge spawns the NEXT pipeline in a goroutine and streams
// Progress events to the supplied channel. The returned tea.Cmd blocks
// until the pipeline finishes; pair it with tuiAwaitExecProgress in a
// tea.Batch so events surface in the model in real time.
func tuiExecBridge(ctx context.Context, rt *runtime, p nextSendParams, ch chan<- Progress) tea.Cmd {
	return func() tea.Msg {
		p.onProgress = func(ev Progress) {
			// Non-blocking-ish: the await Cmd consumes one per call so the
			// channel won't grow unbounded under normal flow.
			ch <- ev
		}
		result, src, dst, err := executeNextBridgeSend(ctx, rt, p)
		close(ch)
		return tuiExecDoneMsg{result: result, src: src, dst: dst, err: err}
	}
}

func tuiAwaitExecProgress(ch <-chan Progress) tea.Cmd {
	return func() tea.Msg {
		ev, ok := <-ch
		if !ok {
			// Channel drained; the Done msg will close out the state.
			return nil
		}
		return tuiExecProgressMsg{p: ev}
	}
}

// tuiTrackTick schedules the next status poll. The 5s cadence is a
// sweet spot for cross-chain bridges — fast enough to feel live, slow
// enough to stay polite on rate-limited public endpoints.
func tuiTrackTick() tea.Cmd {
	return tea.Tick(5*time.Second, func(t time.Time) tea.Msg { return tuiTrackTickMsg(t) })
}

func tuiFetchTrackStatus(ctx context.Context, rt *runtime, txHash string) tea.Cmd {
	return func() tea.Msg {
		st, err := rt.nextClient.TransferStatus(ctx, txHash)
		// Treat NEXT 404 as "not yet indexed" — keep polling, no error.
		if err != nil && isNextNotFound(err) {
			err = nil
		}
		return tuiTrackStatusMsg{status: st, err: err}
	}
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
		if m.loading || m.quoting || m.execMode == execRun ||
			(m.execMode == execTracking && m.trackTickActive) {
			return m, tuiTick()
		}
		return m, nil

	case tuiTokensMsg:
		// Drop responses from a previous API selection — user may have
		// toggled while a fetch was in flight.
		if msg.api != m.api {
			return m, nil
		}
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
		if msg.api != m.api {
			return m, nil
		}
		m.quoting = false
		if msg.err != nil {
			m.err = msg.err.Error()
			return m, nil
		}
		if msg.api == apiNext {
			m.nextRoutes = msg.nextRoutes
			m.options = nil
			m.quoted = len(m.nextRoutes) > 0
			m.selectedNextIdx = 0
			if len(m.nextRoutes) > 0 {
				m.selectedMessenger = m.nextRoutes[0].Messenger
			}
		} else {
			m.options = msg.options
			m.nextRoutes = nil
			m.quoted = len(m.options) > 0
			if len(m.options) > 0 {
				m.selectedMessenger = m.options[0].Messenger
				if len(m.options[0].Payments) > 0 {
					m.selectedFee = m.options[0].Payments[0].Method
				}
			}
		}
		m.err = ""
		return m, nil

	case tuiExecProgressMsg:
		m.applyExecProgress(msg.p)
		return m, tuiAwaitExecProgress(m.execProgressCh)

	case tuiExecDoneMsg:
		m.execResult = msg.result
		m.execSrc = msg.src
		m.execDst = msg.dst
		m.execErr = msg.err
		if msg.err != nil {
			m.execMode = execFailed
		} else {
			m.execMode = execDone
		}
		return m, nil

	case tuiTrackTickMsg:
		if m.execMode != execTracking || m.execResult == nil {
			return m, nil
		}
		return m, tuiFetchTrackStatus(m.ctx, m.rt, m.execResult.TxHash)

	case tuiTrackStatusMsg:
		m.trackStatus = msg.status
		m.trackErr = msg.err
		if m.execMode != execTracking {
			return m, nil
		}
		// Stop polling once status leaves PROCESSING.
		if msg.status != nil && !nextStatusInFlight(msg.status.Status) {
			m.trackTickActive = false
			return m, nil
		}
		// 404 right after broadcast is normal — keep retrying.
		return m, tuiTrackTick()

	case tea.KeyMsg:
		return m.handleKey(msg)
	}
	return m, nil
}

// applyExecProgress folds one Progress event into the model. Same-id
// in-progress→done transitions update in place; unknown ids append a
// new row.
func (m *tuiModel) applyExecProgress(p Progress) {
	for i := range m.execPhases {
		if m.execPhases[i].id == p.Phase {
			m.execPhases[i].status = p.Status
			if p.Note != "" {
				m.execPhases[i].note = p.Note
			}
			if p.Hash != "" {
				m.execPhases[i].hash = p.Hash
				m.execPhases[i].explorerURL = p.ExplorerURL
			}
			if p.Err != nil {
				m.execPhases[i].err = p.Err
			}
			return
		}
	}
	m.execPhases = append(m.execPhases, execPhase{
		id: p.Phase, status: p.Status, note: p.Note,
		hash: p.Hash, explorerURL: p.ExplorerURL, err: p.Err,
	})
}

func (m tuiModel) handleKey(msg tea.KeyMsg) (tea.Model, tea.Cmd) {
	key := msg.String()

	if key == "ctrl+c" || key == "ctrl+q" {
		return m, tea.Quit
	}
	// Ctrl+W: cycle through wallets stored in the local keystore. Doesn't
	// open a modal picker — the cycler keeps the form visible so the user
	// sees the active wallet update in the top bar in place. No filter by
	// chain family yet (that's a v0.3 nice-to-have).
	if key == "ctrl+w" {
		if len(m.wallets) > 1 {
			m.walletIdx = (m.walletIdx + 1) % len(m.wallets)
			m.walletName = m.wallets[m.walletIdx].Name
		}
		return m, nil
	}
	// Ctrl+A: cycle the API surface the wizard is talking to. Resets
	// tokens + quotes because the two products have different token IDs
	// and route shapes; existing selections are stale by definition.
	if key == "ctrl+a" {
		if m.api == apiCore {
			m.api = apiNext
		} else {
			m.api = apiCore
		}
		m.loading = true
		m.tokens = nil
		m.options = nil
		m.nextRoutes = nil
		m.quoted = false
		m.selectedMessenger = ""
		m.selectedFee = ""
		m.err = ""
		return m, tea.Batch(tuiFetchTokens(m.ctx, m.rt, m.api), tuiTick())
	}
	if url, ok := globalLinkForKey(key); ok {
		if err := openExternalLink(url); err != nil {
			m.err = err.Error()
			return m, nil
		}
		return m, nil
	}

	if m.state == statePicker {
		return m.handlePickerKey(key)
	}
	if m.state == stateExec {
		switch m.execMode {
		case execAsk:
			return m.handleExecPassphraseKey(key)
		case execRun:
			return m, nil // pipeline in flight — only ctrl+c escapes
		case execDone, execFailed:
			return m.handleExecResultKey(key)
		case execTracking:
			return m.handleTrackingKey(key)
		}
		return m, nil
	}
	return m.handleFormKey(key)
}

// handleSendButtonKey is the focusSend-specific handler when the form
// is in the post-quote state with two buttons visible. Up/down/h/l cycle
// between [Execute] (idx 0) and [Print] (idx 1); enter triggers active.
func (m tuiModel) handleSendButtonKey(key string) (tea.Model, tea.Cmd) {
	switch key {
	case "left", "h":
		m.sendBtnIdx = 0
	case "right", "l":
		m.sendBtnIdx = 1
	case "p", "P":
		m.sendBtnIdx = 1
		return m.activateSendButton()
	case "e", "E":
		m.sendBtnIdx = 0
		return m.activateSendButton()
	case "enter":
		return m.activateSendButton()
	}
	return m, nil
}

func (m tuiModel) activateSendButton() (tea.Model, tea.Cmd) {
	if m.sendBtnIdx == 1 {
		// Print mode — same as the historical behaviour.
		if m.finalCmdOut != nil {
			*m.finalCmdOut = m.composeBridgeSend()
		}
		return m, tea.Quit
	}
	// Execute mode — switch to a dedicated full-screen exec view so the
	// phase widget + tx links don't have to cram into the form panel.
	m.state = stateExec
	if pp, ok, err := resolveNonInteractivePassphrase(); err == nil && ok {
		m.execPassphrase = pp
		return m.startExec()
	}
	m.execPassphrase = ""
	m.execMode = execAsk
	return m, nil
}

// handleExecPassphraseKey collects the keystore passphrase inline,
// rendering the input as a stream of • characters in the View.
func (m tuiModel) handleExecPassphraseKey(key string) (tea.Model, tea.Cmd) {
	switch key {
	case "esc":
		m.execPassphrase = ""
		m.execMode = execIdle
		m.state = stateForm
		return m, nil
	case "enter":
		if m.execPassphrase == "" {
			m.err = "passphrase cannot be empty"
			return m, nil
		}
		m.err = ""
		return m.startExec()
	case "backspace":
		if len(m.execPassphrase) > 0 {
			m.execPassphrase = m.execPassphrase[:len(m.execPassphrase)-1]
		}
	default:
		if len(key) == 1 {
			c := key[0]
			if c >= 0x20 && c < 0x7f {
				m.execPassphrase += key
			}
		}
	}
	return m, nil
}

// handleExecResultKey: post-run, [T]rack delivery / [N]ew transfer / [Q]uit.
func (m tuiModel) handleExecResultKey(key string) (tea.Model, tea.Cmd) {
	switch key {
	case "n", "N":
		return m.resetExec()
	case "esc":
		// Esc returns to the form keeping result in memory — user can
		// re-enter exec via [N]ew or just close the program.
		m.state = stateForm
		m.execMode = execIdle
		return m, nil
	case "q", "Q":
		return m, tea.Quit
	case "t", "T":
		if m.execMode == execDone && m.execResult != nil && m.execResult.TxHash != "" {
			m.execMode = execTracking
			m.trackStatus = nil
			m.trackErr = nil
			m.trackTickActive = true
			// Kick off both an immediate fetch and the periodic tick so
			// the user sees something within the first second.
			return m, tea.Batch(
				tuiFetchTrackStatus(m.ctx, m.rt, m.execResult.TxHash),
				tuiTrackTick(),
				tuiTick(),
			)
		}
	}
	return m, nil
}

// handleTrackingKey: while we're polling delivery status, allow
// stepping back to the result view (Esc), quitting, or starting fresh.
func (m tuiModel) handleTrackingKey(key string) (tea.Model, tea.Cmd) {
	switch key {
	case "esc":
		m.execMode = execDone
		m.trackTickActive = false
		return m, nil
	case "n", "N":
		return m.resetExec()
	case "q", "Q":
		return m, tea.Quit
	}
	return m, nil
}

// resetExec wipes the exec lifecycle state and returns to a fresh form.

// resetExec wipes the exec lifecycle state and returns to a fresh form,
// leaving the picked tokens / wallet so the user can quickly issue
// another transfer to a different recipient.
func (m tuiModel) resetExec() (tea.Model, tea.Cmd) {
	m.state = stateForm
	m.execMode = execIdle
	m.execPhases = nil
	m.execResult = nil
	m.execSrc, m.execDst = nil, nil
	m.execErr = nil
	m.execPassphrase = ""
	m.trackStatus = nil
	m.trackErr = nil
	m.trackTickActive = false
	m.quoted = false
	m.recipient = ""
	m.focus = focusSendAmount
	return m, nil
}

// startExec wires the pipeline goroutine to the model and transitions
// into execRun mode. Currently NEXT-only — for Core the Execute button
// is greyed out (handled in the button render).
func (m tuiModel) startExec() (tea.Model, tea.Cmd) {
	if m.api != apiNext {
		m.err = "in-place exec is currently NEXT-only; pick [P]rint for Core"
		m.execMode = execIdle
		return m, nil
	}
	m.execPhases = nil
	m.execProgressCh = make(chan Progress, 32)
	m.execMode = execRun
	params := m.buildNextSendParams()
	params.passphrase = m.execPassphrase
	return m, tea.Batch(
		tuiExecBridge(m.ctx, m.rt, params, m.execProgressCh),
		tuiAwaitExecProgress(m.execProgressCh),
		tuiTick(),
	)
}

// buildNextSendParams assembles the nextSendParams from the form state.
// Mirrors what the Cobra dispatch builds in bridge_send.go for --api next.
func (m tuiModel) buildNextSendParams() nextSendParams {
	return nextSendParams{
		fromRef:           m.sendToken.Chain + ":" + m.sendToken.Symbol,
		toRef:             m.recvToken.Chain + ":" + m.recvToken.Symbol,
		amount:            m.sendAmount,
		recipient:         m.recipient,
		messenger:         m.selectedMessenger,
		messengerExplicit: m.selectedMessenger != "",
		walletName:        m.walletName,
		approve:           true, // TUI defaults to "do approve if needed" — human can always edit the printed cmd
		approveWait:       2 * time.Minute,
	}
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
		case "ctrl+p":
			// In-context shortcut: open the wallet picker so the user can
			// drop one of their own addresses into the recipient field
			// (handy for self-bridging, family known from the dest chain).
			m.openWalletPicker(pickForRecipient)
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
	case focusSend:
		// Once quoted the bottom is a two-button row; let arrows / h / l
		// switch between [Execute] and [Print]. E and P are also handled
		// (case-insensitively) as direct shortcuts.
		if m.quoted {
			switch key {
			case "left", "h":
				m.sendBtnIdx = 0
			case "right", "l":
				m.sendBtnIdx = 1
			case "e", "E":
				m.sendBtnIdx = 0
			case "p", "P":
				m.sendBtnIdx = 1
			}
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

	case focusWallet:
		// Enter on the wallet step opens the picker; if the user has zero
		// or one wallets the picker still renders but is mostly empty —
		// guides them toward `wallet add`.
		m.openWalletPicker(pickForSender)

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
		return m, tea.Batch(tuiFetchQuote(m.ctx, m.rt, m.api, m.sendToken, m.recvToken, base), tuiTick())

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
			return m, tea.Batch(tuiFetchQuote(m.ctx, m.rt, m.api, m.sendToken, m.recvToken, base), tuiTick())
		}
		// Quoted — focusSend now hosts two buttons; let the dedicated
		// handler interpret enter/h/l/E/P. handleFormKey upstream catches
		// generic enter; the button-specific path lives in handleSendButtonKey.
		return m.activateSendButton()
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

func (m *tuiModel) openWalletPicker(purpose walletPickerPurpose) {
	m.state = statePicker
	m.picker = pickerWallet
	m.walletPickerPurpose = purpose
	m.pickerCursor = m.walletIdx
	if m.pickerCursor < 0 || m.pickerCursor >= len(m.wallets) {
		m.pickerCursor = 0
	}
	m.pickerOffset = 0
	m.pickerChain = ""
	m.pickerSearch = ""
}

func (m *tuiModel) cycleMessenger(dir int) {
	if m.api == apiNext {
		if len(m.nextRoutes) == 0 {
			return
		}
		m.selectedNextIdx = (m.selectedNextIdx + dir + len(m.nextRoutes)) % len(m.nextRoutes)
		m.selectedMessenger = m.nextRoutes[m.selectedNextIdx].Messenger
		return
	}
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

// selectedNextRoute returns a pointer into m.nextRoutes for the currently
// selected NEXT route, or nil if there are none / index is out of range.
func (m *tuiModel) selectedNextRoute() *tuiNextRoute {
	if m.selectedNextIdx < 0 || m.selectedNextIdx >= len(m.nextRoutes) {
		return nil
	}
	return &m.nextRoutes[m.selectedNextIdx]
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
	walletFlag := ""
	if m.walletName != "" {
		walletFlag = " \\\n    --wallet " + m.walletName
	}
	if m.api == apiNext {
		// NEXT picks the route + fee itself; we only need to point the
		// CLI at the right messenger if the user explicitly cycled. The
		// CLI has its own pickRelayerFee that prefers "native".
		cmd := fmt.Sprintf(`allbridge bridge send --api next \
    --from %s:%s \
    --to %s:%s \
    --amount %s \
    --recipient %s \
    --approve --progress`,
			m.sendToken.Chain, m.sendToken.Symbol,
			m.recvToken.Chain, m.recvToken.Symbol,
			m.sendAmount, // human units; NEXT path converts via humanToBase
			m.recipient,
		)
		if m.selectedMessenger != "" {
			cmd += " \\\n    --messenger " + m.selectedMessenger
		}
		return cmd + walletFlag
	}
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
	) + walletFlag
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
		return focusWallet
	case "ctrl+5":
		return focusRecipient
	case "ctrl+6":
		return focusMessenger
	case "ctrl+7":
		return focusFeeMethod
	case "ctrl+8":
		return focusSend
	}
	return -1
}

func (m tuiModel) handlePickerKey(key string) (tea.Model, tea.Cmd) {
	// Wallet picker is a flat list — no chain chips, no search box —
	// because keystores typically hold a handful of entries. Diverge
	// from the token-picker handler early to keep its logic simple.
	if m.picker == pickerWallet {
		return m.handleWalletPickerKey(key)
	}

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
				m.focus = focusWallet
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

// handleWalletPickerKey is the wallet-picker analogue of
// handlePickerKey — flat list, no search/chain widgets.
func (m tuiModel) handleWalletPickerKey(key string) (tea.Model, tea.Cmd) {
	switch key {
	case "esc":
		m.state = stateForm
		m.picker = pickerNone
		return m, nil

	case "up", "k":
		if m.pickerCursor > 0 {
			m.pickerCursor--
		}

	case "down", "j":
		if m.pickerCursor < len(m.wallets)-1 {
			m.pickerCursor++
		}

	case "home", "g":
		m.pickerCursor = 0

	case "end", "G":
		if len(m.wallets) > 0 {
			m.pickerCursor = len(m.wallets) - 1
		}

	case "enter":
		if m.pickerCursor < 0 || m.pickerCursor >= len(m.wallets) {
			return m, nil
		}
		w := m.wallets[m.pickerCursor]
		switch m.walletPickerPurpose {
		case pickForSender:
			m.walletIdx = m.pickerCursor
			m.walletName = w.Name
			m.focus = focusRecipient
		case pickForRecipient:
			m.recipient = w.Address
			m.focus = focusRecipient
		}
		m.state = stateForm
		m.picker = pickerNone
		return m, nil
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
	switch m.state {
	case statePicker:
		return m.viewPicker(st)
	case stateExec:
		return m.viewExec(st)
	}
	return m.viewForm(st)
}

func (m tuiModel) viewExec(s styles) string {
	var b strings.Builder
	b.WriteString(m.renderTopBar(s))
	b.WriteString("\n\n")

	title := "PASSPHRASE"
	switch m.execMode {
	case execRun, execDone, execFailed:
		title = "EXECUTING"
	case execTracking:
		title = "DELIVERY"
	}
	b.WriteString(s.panelTitle.Render(title))
	b.WriteString("\n\n")
	b.WriteString("  " + s.normal.Render(fmt.Sprintf("%s %s → %s %s   amount %s", m.sendToken.Chain, m.sendToken.Symbol, m.recvToken.Chain, m.recvToken.Symbol, m.sendAmount)))
	b.WriteString("\n  " + s.dim.Render("recipient ") + s.normal.Render(m.recipient) + "\n\n")

	switch m.execMode {
	case execAsk:
		b.WriteString("  " + s.dim.Render("Unlock keystore entry ") + s.normal.Render(m.walletName) + "\n\n")
		mask := strings.Repeat("•", len(m.execPassphrase))
		b.WriteString("  " + s.input.Render(mask+"▮") + "\n\n")
		b.WriteString("  " + s.dim.Render("[enter] confirm   [esc] back to form   [ctrl-c] quit"))
		if m.err != "" {
			b.WriteString("\n  " + s.err.Render("⚠ "+m.err))
		}

	case execRun, execDone, execFailed:
		for _, ph := range m.execPhases {
			icon := "○"
			switch ph.status {
			case PhaseRunning:
				icon = spinnerFrame(m.spinIdx)
			case PhaseDone:
				icon = s.ok.Render("✓")
			case PhaseSkipped:
				icon = s.dim.Render("·")
			case PhaseFailed:
				icon = s.err.Render("✗")
			}
			line := "  " + icon + "  " + s.normal.Render(string(ph.id))
			if ph.note != "" {
				line += s.dim.Render("  — "+ph.note)
			}
			b.WriteString(line + "\n")
			if ph.hash != "" {
				if ph.explorerURL != "" {
					b.WriteString("       " + s.dim.Render("hash ") + ph.hash + "  " + s.linkColor.Render(ph.explorerURL) + "\n")
				} else {
					b.WriteString("       " + s.dim.Render("hash ") + ph.hash + "\n")
				}
			}
			if ph.err != nil {
				b.WriteString("       " + s.err.Render(ph.err.Error()) + "\n")
			}
		}
		switch m.execMode {
		case execDone:
			b.WriteString("\n  " + s.ok.Render("✓ funds dispatched on the source chain") + "\n")
			b.WriteString("  " + s.dim.Render("Delivery on the destination chain typically takes a few minutes.") + "\n")
			b.WriteString("\n  " + s.accent.Render("[T]rack delivery") + s.dim.Render("    [N]ew transfer    [esc] back to form    [Q]uit"))
		case execFailed:
			if m.execErr != nil {
				b.WriteString("\n  " + s.err.Render("✗ failed: "+m.execErr.Error()) + "\n")
			}
			b.WriteString("\n  " + s.accent.Render("[N]ew transfer") + s.dim.Render("    [esc] back to form    [Q]uit"))
		}

	case execTracking:
		if m.trackErr != nil {
			b.WriteString("  " + s.err.Render("⚠ "+m.trackErr.Error()) + "\n")
		} else if m.trackStatus == nil {
			b.WriteString("  " + spinnerFrame(m.spinIdx) + " " + s.dim.Render("not yet indexed by NEXT — polling every 5s …") + "\n")
		} else {
			st := m.trackStatus
			b.WriteString("  " + s.cardLabel.Render("status     ") + statusBadge(s, st.Status) + "\n")
			b.WriteString("  " + s.cardLabel.Render("from       ") + st.SourceChain + ":" + st.SourceTokenID + "\n")
			b.WriteString("  " + s.cardLabel.Render("to         ") + st.DestinationChain + ":" + st.DestinationTokenID + "\n")
			if st.AmountInFormatted != "" {
				b.WriteString("  " + s.cardLabel.Render("send       ") + st.AmountInFormatted + "\n")
			}
			if st.AmountOutFormatted != "" {
				b.WriteString("  " + s.cardLabel.Render("receive    ") + st.AmountOutFormatted + "\n")
			}
			if st.SendTx.ID != "" {
				b.WriteString("  " + s.cardLabel.Render("sendTx     ") + st.SendTx.ID + "\n")
			}
			if st.ReceiveTx != nil && st.ReceiveTx.ID != "" {
				b.WriteString("  " + s.cardLabel.Render("receiveTx  ") + st.ReceiveTx.ID + "\n")
			}
		}
		b.WriteString("\n  " + s.accent.Render("[N]ew transfer") + s.dim.Render("    [esc] back to result    [Q]uit"))
	}

	b.WriteString("\n\n" + m.renderFooter(s))
	return b.String()
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
	walletLabel := m.walletName
	if walletLabel == "" {
		walletLabel = "no wallet"
	} else if m.walletIdx >= 0 && m.walletIdx < len(m.wallets) {
		walletLabel += " [" + m.wallets[m.walletIdx].Family + "]"
	}
	apiTag := "core"
	if m.api == apiNext {
		apiTag = "next"
	}
	left := s.brand.Render("ALLBRIDGE") + s.dim.Render("  Swap  ["+apiTag+"]")
	right := s.dim.Render(fmt.Sprintf("wallet: %s   ·   %s", walletLabel, v))
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

	walletLine := m.renderWalletField(s, innerW)
	actionArea := m.renderActionArea(s, innerW)

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
		m.stepLabel(s, 4, focusWallet, "Wallet (sender)"),
		walletLine,
		"",
		m.stepLabel(s, 5, focusRecipient, "Recipient address on "+chainOrPlaceholder(m.recvToken.Chain)) + s.dim.Render("    Ctrl+P pick from your wallets"),
		rcptBox,
		"",
		actionArea,
	}
	return s.panel.Width(width).Render(s.panelTitle.Render("SWAP") + "\n" + strings.Join(parts, "\n"))
}

// renderActionArea is the bottom of the form panel. Always shows the
// button row (get-quote → two buttons after the quote arrives); the
// exec lifecycle moved to a dedicated full-screen state because the
// phase widget + tx links don't comfortably fit inside the form.
func (m tuiModel) renderActionArea(s styles, _ int) string {
	return m.renderActionButtons(s)
}

func (m tuiModel) renderActionButtons(s styles) string {
	if m.quoting {
		return s.button.Render("  … quoting  ")
	}
	if !m.quoted {
		label := "Get quote"
		btn := s.button.Render("  " + label + "  ")
		if m.focus == focusSend {
			btn = s.buttonActive.Render("  " + label + "  ")
		}
		return btn
	}
	// Two buttons side by side. Render the inactive ones with the muted
	// `button` style; only the focused-AND-selected one gets the
	// highlight treatment.
	execLbl := "Execute"
	if m.api != apiNext {
		execLbl = "Execute (NEXT only)"
	}
	printLbl := "Print command"

	wrap := func(label string, active bool) string {
		if active {
			return s.buttonActive.Render("  " + label + "  ")
		}
		return s.button.Render("  " + label + "  ")
	}
	exec := wrap(execLbl, m.focus == focusSend && m.sendBtnIdx == 0)
	prnt := wrap(printLbl, m.focus == focusSend && m.sendBtnIdx == 1)
	// JoinHorizontal aligns the two bordered blocks on the same baseline
	// — string concat would just stack their inner lines vertically.
	return lipgloss.JoinHorizontal(lipgloss.Top, exec, "  ", prnt)
}

func statusBadge(s styles, status string) string {
	switch strings.ToUpper(strings.TrimSpace(status)) {
	case "SUCCESS":
		return s.ok.Render(status)
	case "FAILED", "REFUNDED":
		return s.err.Render(status)
	}
	return s.normal.Render(status)
}

// renderWalletField is the inline form widget for the [4] Wallet step:
// shows the current wallet's name + family + full address, focused
// border when the user is on this step. Enter opens the picker.
func (m tuiModel) renderWalletField(s styles, innerW int) string {
	var inner string
	if len(m.wallets) == 0 {
		inner = "  " + s.placeholder.Render("(no wallets — run `allbridge wallet add` first)")
	} else if m.walletIdx < 0 || m.walletIdx >= len(m.wallets) {
		inner = "  " + s.placeholder.Render("(none selected — press Enter to pick)")
	} else {
		w := m.wallets[m.walletIdx]
		inner = "  " + s.normal.Render(w.Name) + s.dim.Render("  ["+w.Family+"]") + "\n" +
			"  " + s.dim.Render(w.Address)
	}
	return m.box(s, focusWallet, innerW, inner)
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
		endpoint := "/bridge/quote"
		if m.api == apiNext {
			endpoint = "NEXT /quote"
		}
		b.WriteString("  " + spinnerFrame(m.spinIdx) + " " + s.dim.Render("waiting for "+endpoint+" …") + "\n")
	} else if !m.quoted {
		b.WriteString("  " + s.dim.Render("Quote runs after step [4] (recipient).") + "\n")
	} else if m.api == apiNext {
		// NEXT routes carry their own amountOut & ETA; show the picked one.
		if r := m.selectedNextRoute(); r != nil {
			if r.EstSeconds > 0 {
				b.WriteString("  " + s.cardLabel.Render("ETA       ") + fmt.Sprintf("%ds", r.EstSeconds) + "\n")
			}
			if r.AmountOut != "" {
				b.WriteString("  " + s.cardLabel.Render("Receive   ") +
					baseToHuman(r.AmountOut, m.recvToken.Decimals) + " " + m.recvToken.Symbol + "\n")
			}
		}
	} else {
		opt := m.optionByMessenger(m.selectedMessenger)
		b.WriteString("  " + s.cardLabel.Render("ETA       ") + formatEtaMs(opt.EtaMs) + "\n")
		if opt.MinOut != "" {
			b.WriteString("  " + s.cardLabel.Render("Receive ≥ ") +
				baseToHuman(opt.MinOut, m.recvToken.Decimals) + " " + m.recvToken.Symbol + "\n")
		}
	}
	b.WriteString("\n")

	b.WriteString(m.stepLabel(s, 6, focusMessenger, "Messenger") + "\n")
	if !m.quoted {
		b.WriteString("  " + s.dim.Render("(no options yet)") + "\n")
	} else if m.api == apiNext {
		// NEXT route list: messenger × est × fee, no fee-method matrix.
		for i, r := range m.nextRoutes {
			marker := "  ○  "
			if i == m.selectedNextIdx {
				marker = s.accent.Render("  ●  ")
			}
			etaStr := ""
			if r.EstSeconds > 0 {
				etaStr = "   ETA " + fmt.Sprintf("%ds", r.EstSeconds)
			}
			feeStr := ""
			if r.FeeAmount != "" && r.FeeAmount != "0" {
				feeStr = "   fee " + r.FeeAmount + " " + r.FeeTokenID
			}
			b.WriteString(marker + r.Messenger + s.dim.Render(etaStr+feeStr) + "\n")
		}
	} else {
		for _, o := range m.options {
			marker := "  ○  "
			if o.Messenger == m.selectedMessenger {
				marker = s.accent.Render("  ●  ")
			}
			line := marker + o.Messenger + s.dim.Render("   ETA "+formatEtaMs(o.EtaMs))
			b.WriteString(line + "\n")
		}
	}
	b.WriteString("\n")

	b.WriteString(m.stepLabel(s, 7, focusFeeMethod, "Pay fee in") + "\n")
	if !m.quoted {
		b.WriteString("  " + s.dim.Render("(no methods yet)") + "\n")
	} else if m.api == apiNext {
		// NEXT picks fee token itself ("native" by default); we surface
		// it read-only so the user knows what they're getting.
		if r := m.selectedNextRoute(); r != nil {
			b.WriteString("  " + s.dim.Render("(picked by NEXT: ") + r.FeeTokenID + s.dim.Render(")") + "\n")
		}
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

	if m.picker == pickerWallet {
		return m.renderWalletPicker(s, width)
	}

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

// renderWalletPicker is the wallet-list modal — flat list of name +
// family + address, with a row marker for the cursor and a header
// reflecting whether we're picking sender or recipient.
func (m tuiModel) renderWalletPicker(s styles, width int) string {
	var b strings.Builder
	title := "Select sender wallet"
	if m.walletPickerPurpose == pickForRecipient {
		title = "Select recipient wallet"
	}
	b.WriteString(s.panelTitle.Render(title) + "  " + s.dim.Render("[esc] back   [↑↓] navigate   [enter] pick"))
	b.WriteString("\n\n")

	if len(m.wallets) == 0 {
		b.WriteString(s.dim.Render("  no wallets in keystore — run `allbridge wallet add <name>`") + "\n")
		return s.panel.Width(width).Render(b.String())
	}

	// Pin viewport around cursor; same window-roll logic as the token
	// picker but without chain chips or search.
	from := m.pickerOffset
	to := from + pickerVisibleRows
	if to > len(m.wallets) {
		to = len(m.wallets)
	}
	for i := from; i < to; i++ {
		w := m.wallets[i]
		marker := "  "
		if i == m.pickerCursor {
			marker = s.accent.Render("▶ ")
		}
		row := marker + s.normal.Render(padTo(w.Name, 16)) + s.dim.Render("  ["+padTo(w.Family, 7)+"]  ") + s.dim.Render(w.Address)
		b.WriteString(row + "\n")
	}
	if to < len(m.wallets) {
		b.WriteString(s.dim.Render("  …") + "\n")
	}
	b.WriteString("\n" + s.dim.Render(fmt.Sprintf("  [%d / %d]", m.pickerCursor+1, len(m.wallets))) + "\n")
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
		if m.quoted {
			if m.sendBtnIdx == 0 {
				return "Now: Enter to execute the bridge in-place (passphrase prompt next)."
			}
			return "Now: Enter to print the ready-to-run command and exit."
		}
		return "Now: Enter to fetch a quote."
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
		"ctrl+1..8 jump", "enter confirm",
		"↑↓ navigate", "ctrl+a toggle api", "ctrl+w cycle wallet", "ctrl+p pick wallet for recipient", "ctrl-c quit",
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
	ok              lipgloss.Style
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
			ok: p.Bold(true), hint: p.Italic(true), linkColor: p.Underline(true),
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
		ok:          lipgloss.NewStyle().Foreground(cGood).Bold(true),
		hint:        lipgloss.NewStyle().Foreground(cAccent).Italic(true),
		linkColor:   lipgloss.NewStyle().Foreground(cAccent).Underline(true),
	}
}
