package cli

// PhaseID is the canonical name of a step inside a bridge-send pipeline.
// The TUI renders these in a fixed order; the CLI prints them as
// spinner status updates. Keep names short — they're shown to humans.
type PhaseID string

const (
	PhasePreflight   PhaseID = "preflight"
	PhaseAllowance   PhaseID = "allowance"
	PhaseApprove     PhaseID = "approve"
	PhaseApproveWait PhaseID = "approve-wait"
	PhaseQuote       PhaseID = "quote"
	PhaseBuild       PhaseID = "build"
	PhaseSign        PhaseID = "sign"
	PhaseBroadcast   PhaseID = "broadcast"
	PhaseDelivered   PhaseID = "delivered"
)

// PhaseStatus tells the renderer how to mark the phase. Phases progress
// strictly forward; once Done or Failed they don't re-fire.
type PhaseStatus int

const (
	PhasePending PhaseStatus = iota
	PhaseRunning
	PhaseDone
	PhaseSkipped // used for Approve when allowance is already sufficient
	PhaseFailed
)

// Progress is one event emitted by the send pipeline. The pipeline calls
// the user-supplied callback with these structs every time something
// observable happens (a phase starts, finishes, produces a hash, etc).
type Progress struct {
	Phase  PhaseID
	Status PhaseStatus
	// Note is a short human-readable detail (e.g. the chain RPC URL).
	Note string
	// Hash + ExplorerURL populate as soon as a tx is broadcast. Hash is
	// the on-chain identifier; ExplorerURL is best-effort (empty if we
	// don't know an explorer for the chain).
	Hash        string
	ExplorerURL string
	// Err is set when Status == PhaseFailed.
	Err error
}

// ProgressFunc is what callers pass into the send functions. nil is
// safe — pipelines guard against it.
type ProgressFunc func(Progress)

func (f ProgressFunc) emit(p Progress) {
	if f != nil {
		f(p)
	}
}
