package dto

// CreateTicketRequest is the user-facing ticket creation payload.
// AttachmentUrls must be opaque references returned by this server's own
// upload endpoint (validated at the controller boundary), never arbitrary URLs.
type CreateTicketRequest struct {
	Category        string   `json:"category"`
	Priority        string   `json:"priority"`
	Subject         string   `json:"subject"`
	Body            string   `json:"body"`
	ClientRequestId string   `json:"client_request_id"`
	AttachmentUrls  []string `json:"attachment_urls"`
}

// AdminCreateTicketRequest lets staff open a ticket on a user's behalf.
type AdminCreateTicketRequest struct {
	UserId          int      `json:"user_id"`
	Category        string   `json:"category"`
	Priority        string   `json:"priority"`
	Subject         string   `json:"subject"`
	Body            string   `json:"body"`
	ClientRequestId string   `json:"client_request_id"`
	AttachmentUrls  []string `json:"attachment_urls"`
}

// ReplyTicketRequest is a new message on an existing ticket. Internal is
// accepted from staff callers only; the user-facing controller rejects it.
type ReplyTicketRequest struct {
	Body            string   `json:"body"`
	Internal        bool     `json:"internal"`
	ClientRequestId string   `json:"client_request_id"`
	AttachmentUrls  []string `json:"attachment_urls"`
}

// TicketAttachmentUploadResponse is returned by the ticket attachment upload
// endpoint: the caller collects these references client-side across independent
// uploads and submits them together with the ticket create/reply request.
type TicketAttachmentUploadResponse struct {
	Url string `json:"url"`
}

type TicketAttachmentDownloadResponse struct {
	Url string `json:"url"`
}

// TicketVersionRequest carries the caller's last-seen version for an
// optimistic-concurrency action (resolve, reopen, assignment).
type TicketVersionRequest struct {
	ExpectedVersion int64 `json:"expected_version"`
}

// AssignTicketRequest sets or clears (AssigneeUserId == nil) the assignee.
type AssignTicketRequest struct {
	AssigneeUserId  *int  `json:"assignee_user_id"`
	ExpectedVersion int64 `json:"expected_version"`
}

// AddTicketTagsRequest adds one or more tags to a ticket. Tagging does not
// participate in the ticket's optimistic-concurrency Version: it is a
// satellite table, not a mutable snapshot field.
type AddTicketTagsRequest struct {
	Tags []string `json:"tags"`
}

// TicketResponse is the API-safe view of a ticket: it never exposes the
// sequential primary key, only the unpredictable public id.
type TicketResponse struct {
	PublicId            string `json:"public_id"`
	UserId              int    `json:"user_id"`
	InitiatedBy         string `json:"initiated_by"`
	Subject             string `json:"subject"`
	Category            string `json:"category"`
	Priority            string `json:"priority"`
	Status              string `json:"status"`
	WaitingOn           string `json:"waiting_on"`
	AssignedTo          *int   `json:"assigned_to"`
	MessageCount        int    `json:"message_count"`
	Version             int64  `json:"version"`
	CreatedAt           int64  `json:"created_at"`
	UpdatedAt           int64  `json:"updated_at"`
	ResolvedAt          *int64 `json:"resolved_at"`
	DeletedAt           *int64 `json:"deleted_at"`
	DeletedByUserId     int    `json:"deleted_by_user_id,omitempty"`
	LastMessageAt       int64  `json:"last_message_at"`
	LastPublicMessageAt int64  `json:"last_public_message_at"`
	// UnreadCount, Username, and DisplayName are list-enrichment fields:
	// only the admin ticket list populates them (one batched query per page),
	// so a nil/blank value here means "not computed for this endpoint", not
	// "definitely zero/absent".
	UnreadCount *int64 `json:"unread_count,omitempty"`
	Username    string `json:"username,omitempty"`
	DisplayName string `json:"display_name,omitempty"`
	// Tags is populated only where the caller explicitly loads them (the admin
	// list/detail endpoints), same "nil means not computed" convention as
	// UnreadCount above.
	Tags []string `json:"tags,omitempty"`
	// UserProfile is populated only on GetTicketAdmin, and only when the
	// caller holds authz.TicketViewUserProfile — it exposes account/billing
	// details beyond the ticket itself, so it is opt-in rather than bundled
	// into the base TicketRead permission.
	UserProfile *TicketUserProfile `json:"user_profile,omitempty"`
}

// TicketUserProfile is the ticket requester's account snapshot shown to
// staff investigating a case.
type TicketUserProfile struct {
	Quota  int    `json:"quota"`
	Group  string `json:"group"`
	Role   int    `json:"role"`
	Status int    `json:"status"`
}

// TicketMessageResponse is the API-safe view of one message. Unlike a ticket's
// sequential id, a message id carries no cross-ticket enumeration risk: every
// endpoint that accepts one always re-scopes it by the ticket's public id, so
// it's kept as the keyset pagination cursor.
type TicketMessageResponse struct {
	Id             int64    `json:"id"`
	AuthorUserId   int      `json:"author_user_id"`
	AuthorKind     string   `json:"author_kind"`
	Visibility     string   `json:"visibility"`
	Body           string   `json:"body"`
	AttachmentUrls []string `json:"attachment_urls,omitempty"`
	CreatedAt      int64    `json:"created_at"`
}

// TicketSettingsResponse exposes only the public ticket-system switch.
type TicketSettingsResponse struct {
	Version int64 `json:"version"`
	Enabled bool  `json:"enabled"`
}

// UpdateTicketSettingsRequest updates the public ticket-system switch with
// optimistic concurrency so two administrators cannot silently overwrite it.
type UpdateTicketSettingsRequest struct {
	Enabled         bool  `json:"enabled"`
	ExpectedVersion int64 `json:"expected_version"`
}
