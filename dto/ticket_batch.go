package dto

// TicketBatchItem is one row of a bulk CAS operation: the ticket to act on,
// carrying its own expected_version exactly like the single-ticket
// resolve/assign endpoints require. Bulk tagging doesn't need this shape —
// tags are not CAS-guarded (see model.AddTicketTags) — so BulkTagTicketsRequest
// takes a plain list of public ids instead.
type TicketBatchItem struct {
	PublicId        string `json:"public_id"`
	ExpectedVersion int64  `json:"expected_version"`
}

// BulkResolveTicketsRequest resolves every item independently: each item's
// own expected_version is checked by the underlying single-ticket CAS
// mutator, so one item's stale version never blocks the others.
type BulkResolveTicketsRequest struct {
	Items []TicketBatchItem `json:"items"`
}

// BulkAssignTicketsRequest assigns every item to the same AssigneeUserId
// (nil clears the assignment), each gated by its own expected_version.
type BulkAssignTicketsRequest struct {
	Items          []TicketBatchItem `json:"items"`
	AssigneeUserId *int              `json:"assignee_user_id"`
}

// BulkTagTicketsRequest adds Tags to every ticket in PublicIds. Tagging is
// not CAS-guarded, so items here are bare public ids, not TicketBatchItem.
type BulkTagTicketsRequest struct {
	PublicIds []string `json:"public_ids"`
	Tags      []string `json:"tags"`
}

// TicketBatchResult reports one item's outcome. Error is human-readable and
// only populated when Success is false; VersionConflict distinguishes a
// stale-version failure (caller should reload and retry) from every other
// failure (not found, validation, db error).
type TicketBatchResult struct {
	PublicId        string `json:"public_id"`
	Success         bool   `json:"success"`
	Error           string `json:"error,omitempty"`
	VersionConflict bool   `json:"version_conflict,omitempty"`
}

// BulkTicketResponse is the shared response shape for every bulk ticket
// endpoint: one result per requested item, in request order. A non-2xx-style
// partial failure never aborts the batch — see controller/ticket_batch.go.
type BulkTicketResponse struct {
	Results []TicketBatchResult `json:"results"`
}
