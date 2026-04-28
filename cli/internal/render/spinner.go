package render

import (
	"context"
	"fmt"
	"io"
	"os"
	"sync"
	"time"

	"github.com/charmbracelet/lipgloss"
	"golang.org/x/term"
)

type Spinner struct {
	w       io.Writer
	frames  []string
	delay   time.Duration
	mu      sync.Mutex
	msg     string
	cancel  context.CancelFunc
	enabled bool
}

func NewSpinner() *Spinner {
	w := os.Stderr
	enabled := term.IsTerminal(int(w.Fd()))
	return &Spinner{
		w:       w,
		frames:  []string{"⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"},
		delay:   90 * time.Millisecond,
		enabled: enabled,
	}
}

func (s *Spinner) Start(msg string) {
	s.mu.Lock()
	s.msg = msg
	if !s.enabled {
		_, _ = fmt.Fprintln(s.w, msg)
		s.mu.Unlock()
		return
	}
	if s.cancel != nil {
		s.mu.Unlock()
		return
	}
	ctx, cancel := context.WithCancel(context.Background())
	s.cancel = cancel
	s.mu.Unlock()

	go s.loop(ctx)
}

func (s *Spinner) Update(msg string) {
	s.mu.Lock()
	s.msg = msg
	s.mu.Unlock()
}

func (s *Spinner) Stop(finalMsg string) {
	s.mu.Lock()
	if s.cancel != nil {
		s.cancel()
		s.cancel = nil
	}
	s.mu.Unlock()
	if !s.enabled {
		if finalMsg != "" {
			_, _ = fmt.Fprintln(s.w, finalMsg)
		}
		return
	}
	_, _ = fmt.Fprint(s.w, "\r\033[K")
	if finalMsg != "" {
		_, _ = fmt.Fprintln(s.w, finalMsg)
	}
}

func (s *Spinner) loop(ctx context.Context) {
	t := time.NewTicker(s.delay)
	defer t.Stop()
	style := lipgloss.NewStyle().Foreground(ColorBrand)
	i := 0
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			s.mu.Lock()
			msg := s.msg
			s.mu.Unlock()
			frame := style.Render(s.frames[i%len(s.frames)])
			_, _ = fmt.Fprintf(s.w, "\r\033[K%s %s", frame, msg)
			i++
		}
	}
}
