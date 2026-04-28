package cli

import "fmt"

const (
	ExitOK      = 0
	ExitUser    = 1
	ExitNetwork = 2
	ExitChain   = 3
	ExitWallet  = 4
)

type ExitError struct {
	Code    int
	Message string
	Cause   error
}

func (e *ExitError) Error() string {
	if e.Message != "" {
		return e.Message
	}
	if e.Cause != nil {
		return e.Cause.Error()
	}
	return fmt.Sprintf("exit %d", e.Code)
}

func (e *ExitError) Unwrap() error { return e.Cause }

func userErr(message string) error {
	return &ExitError{Code: ExitUser, Message: message}
}

func userErrf(format string, args ...any) error {
	return &ExitError{Code: ExitUser, Message: fmt.Sprintf(format, args...)}
}

func netErr(err error) error {
	if err == nil {
		return nil
	}
	return &ExitError{Code: ExitNetwork, Message: err.Error(), Cause: err}
}

func chainErr(message string) error {
	return &ExitError{Code: ExitChain, Message: message}
}

func chainErrf(format string, args ...any) error {
	return &ExitError{Code: ExitChain, Message: fmt.Sprintf(format, args...)}
}

func walletErr(message string) error {
	return &ExitError{Code: ExitWallet, Message: message}
}

func walletErrf(format string, args ...any) error {
	return &ExitError{Code: ExitWallet, Message: fmt.Sprintf(format, args...)}
}
