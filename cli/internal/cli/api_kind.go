package cli

import "strings"

// apiKind selects which Allbridge product surface a command queries.
// Defaults to apiCore for backward compatibility; users opt into NEXT
// (or a unified view) explicitly via --api.
type apiKind int

const (
	apiCore apiKind = iota
	apiNext
	apiBoth
)

func (k apiKind) String() string {
	switch k {
	case apiNext:
		return "next"
	case apiBoth:
		return "both"
	default:
		return "core"
	}
}

func parseAPIKind(s string) (apiKind, error) {
	switch strings.ToLower(strings.TrimSpace(s)) {
	case "", "core":
		return apiCore, nil
	case "next":
		return apiNext, nil
	case "both":
		return apiBoth, nil
	}
	return 0, userErrf("unknown --api %q (want core|next|both)", s)
}
