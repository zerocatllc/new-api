package model

import (
	"errors"
	"fmt"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

// Ticket status is an objective fact, not a role-relative one: it never
// depends on who created the ticket or who replied last. This is the fix for
// RixAPI's waiting_reply/in_progress pair, whose meaning flips depending on
// initiated_by — a bug-prone design this schema deliberately avoids.
const (
	TicketStatusOpen     = "open"
	TicketStatusResolved = "resolved"

	// WaitingOn names whichever side needs to act next. It is set purely from
	// "who sent the last public message", never from role-dependent inference.
	TicketWaitingOnStaff = "staff"
	TicketWaitingOnUser  = "user"
	TicketWaitingOnNone  = "none"

	TicketInitiatedByUser  = "user"
	TicketInitiatedByStaff = "staff"

	TicketCategoryGeneral   = "general"
	TicketCategoryTechnical = "technical"
	TicketCategoryBilling   = "billing"
	TicketCategoryFeature   = "feature"
	TicketCategoryBug       = "bug"
	TicketCategoryOther     = "other"

	TicketPriorityLow      = "low"
	TicketPriorityNormal   = "normal"
	TicketPriorityHigh     = "high"
	TicketPriorityCritical = "critical"

	TicketAuthorKindUser   = "user"
	TicketAuthorKindStaff  = "staff"
	TicketAuthorKindSystem = "system"

	TicketVisibilityPublic   = "public"
	TicketVisibilityInternal = "internal"

	// Length bounds are code constants, not admin-configurable settings — the
	// plan treats abuse limits as a security boundary, not a product knob.
	TicketSubjectMinLength = 1
	TicketSubjectMaxLength = 200
	TicketBodyMinLength    = 1
	TicketBodyMaxLength    = 5000

	// TicketAttachmentMaxCount bounds how many attachment URLs one ticket
	// message may carry — a code constant, not an admin-configurable setting,
	// for the same reason as the length bounds above.
	TicketAttachmentMaxCount = 5

	// Existing rows from rolling upgrades can retain NULL in columns added for
	// attachment-retention claims. NULL means the same thing as zero: no worker
	// owns the ticket. Every claim gate must use this shared predicate so those
	// rows do not become permanently immutable.
	ticketAttachmentRetentionUnclaimedSQL = "(attachment_retention_claim_id = 0 OR attachment_retention_claim_id IS NULL)"
)

// ErrTicketVersionConflict is returned when a caller's expected_version no
// longer matches the persisted row: the caller must reload and retry.
var ErrTicketVersionConflict = errors.New("ticket was modified concurrently, reload and retry")

// ErrTicketCreateReplayRemoved is returned when a create request replays a
// client_request_id whose original ticket was since soft-deleted: the
// idempotency reservation still exists, but the ticket it points at is in the
// trash, so the replay can neither return it nor open a new one.
var ErrTicketCreateReplayRemoved = errors.New("原工单已被删除，请使用新的请求重新创建")

type ErrTooManyOpenTickets struct{ Limit int64 }

func (e ErrTooManyOpenTickets) Error() string {
	return fmt.Sprintf("you already have %d open tickets, resolve one before opening another", e.Limit)
}

type ErrTooManyTicketsCreated struct{ Limit int64 }

func (e ErrTooManyTicketsCreated) Error() string {
	return fmt.Sprintf("you can create at most %d tickets in 24 hours", e.Limit)
}

type TicketCreateLimits struct {
	MaxOpen      int64
	MaxCreated   int64
	CreatedSince int64
}

var (
	ticketStatuses = map[string]struct{}{
		TicketStatusOpen: {}, TicketStatusResolved: {},
	}
	ticketWaitingOns = map[string]struct{}{
		TicketWaitingOnStaff: {}, TicketWaitingOnUser: {}, TicketWaitingOnNone: {},
	}
	ticketInitiatedBys = map[string]struct{}{
		TicketInitiatedByUser: {}, TicketInitiatedByStaff: {},
	}
	ticketCategories = map[string]struct{}{
		TicketCategoryGeneral: {}, TicketCategoryTechnical: {}, TicketCategoryBilling: {},
		TicketCategoryFeature: {}, TicketCategoryBug: {}, TicketCategoryOther: {},
	}
	ticketPriorities = map[string]struct{}{
		TicketPriorityLow: {}, TicketPriorityNormal: {}, TicketPriorityHigh: {}, TicketPriorityCritical: {},
	}
	ticketAuthorKinds = map[string]struct{}{
		TicketAuthorKindUser: {}, TicketAuthorKindStaff: {}, TicketAuthorKindSystem: {},
	}
	ticketVisibilities = map[string]struct{}{
		TicketVisibilityPublic: {}, TicketVisibilityInternal: {},
	}
)

func ValidateTicketCategory(v string) error {
	if _, ok := ticketCategories[v]; !ok {
		return fmt.Errorf("unsupported ticket category %q", v)
	}
	return nil
}

func ValidateTicketPriority(v string) error {
	if _, ok := ticketPriorities[v]; !ok {
		return fmt.Errorf("unsupported ticket priority %q", v)
	}
	return nil
}

func ValidateTicketInitiatedBy(v string) error {
	if _, ok := ticketInitiatedBys[v]; !ok {
		return fmt.Errorf("unsupported ticket initiated_by %q", v)
	}
	return nil
}

func ValidateTicketAuthorKind(v string) error {
	if _, ok := ticketAuthorKinds[v]; !ok {
		return fmt.Errorf("unsupported ticket author kind %q", v)
	}
	return nil
}

func ValidateTicketVisibility(v string) error {
	if _, ok := ticketVisibilities[v]; !ok {
		return fmt.Errorf("unsupported ticket visibility %q", v)
	}
	return nil
}

func ValidateTicketSubject(subject string) error {
	n := len([]rune(strings.TrimSpace(subject)))
	if n < TicketSubjectMinLength || n > TicketSubjectMaxLength {
		return fmt.Errorf("ticket subject must be %d-%d characters", TicketSubjectMinLength, TicketSubjectMaxLength)
	}
	return nil
}

func ValidateTicketBody(body string) error {
	n := len([]rune(strings.TrimSpace(body)))
	if n < TicketBodyMinLength || n > TicketBodyMaxLength {
		return fmt.Errorf("ticket body must be %d-%d characters", TicketBodyMinLength, TicketBodyMaxLength)
	}
	return nil
}

// ValidateTicketAttachmentUrls bounds the attachment count. It does not check
// that each URL belongs to this server's own storage — that check requires
// storage configuration the model layer has no business depending on, so it
// is the controller boundary's job.
func ValidateTicketAttachmentUrls(urls []string) error {
	if len(urls) > TicketAttachmentMaxCount {
		return fmt.Errorf("a ticket message may carry at most %d attachments", TicketAttachmentMaxCount)
	}
	for _, u := range urls {
		if strings.TrimSpace(u) == "" {
			return errors.New("attachment url must not be blank")
		}
	}
	return nil
}

// ValidateTicketCreateInput is the single validation boundary shared by the
// create model and the service's pre-limit idempotency lookup.
func ValidateTicketCreateInput(initiatedBy, category, priority, subject, body, clientRequestID string, attachmentURLs []string) error {
	if err := ValidateTicketInitiatedBy(initiatedBy); err != nil {
		return err
	}
	if err := ValidateTicketCategory(category); err != nil {
		return err
	}
	if err := ValidateTicketPriority(priority); err != nil {
		return err
	}
	if err := ValidateTicketSubject(subject); err != nil {
		return err
	}
	if err := ValidateTicketBody(body); err != nil {
		return err
	}
	if strings.TrimSpace(clientRequestID) == "" {
		return errors.New("client_request_id is required")
	}
	return ValidateTicketAttachmentUrls(attachmentURLs)
}

// Ticket is the conversation's objective state snapshot. It carries only facts
// derivable from the message stream (who must act next, counts, timestamps);
// no per-viewer state lives here — that is ticket_read_cursors.
type Ticket struct {
	Id                  int64  `json:"id" gorm:"primaryKey"`
	PublicId            string `json:"public_id" gorm:"type:varchar(64);uniqueIndex"`
	UserId              int    `json:"user_id" gorm:"index:idx_ticket_user,priority:1"`
	InitiatedBy         string `json:"initiated_by" gorm:"type:varchar(16)"`
	Subject             string `json:"subject" gorm:"type:varchar(200)"`
	Category            string `json:"category" gorm:"type:varchar(32);index:idx_ticket_category,priority:1"`
	Priority            string `json:"priority" gorm:"type:varchar(16);index:idx_ticket_priority,priority:1"`
	Status              string `json:"status" gorm:"type:varchar(16);index:idx_ticket_status,priority:1"`
	WaitingOn           string `json:"waiting_on" gorm:"type:varchar(16);index:idx_ticket_status,priority:2"`
	AssignedTo          *int   `json:"assigned_to" gorm:"index:idx_ticket_assigned,priority:1"`
	LastMessageId       int64  `json:"last_message_id"`
	LastPublicMessageId int64  `json:"last_public_message_id"`
	LastMessageAt       int64  `json:"last_message_at"`
	LastPublicMessageAt int64  `json:"last_public_message_at" gorm:"index:idx_ticket_status,priority:3"`
	MessageCount        int    `json:"message_count"`
	Version             int64  `json:"version"`
	CreatedAt           int64  `json:"created_at"`
	UpdatedAt           int64  `json:"updated_at" gorm:"index:idx_ticket_user,priority:2"`
	ResolvedAt          *int64 `json:"resolved_at"`
	DeletedAt           *int64 `json:"deleted_at" gorm:"index:idx_ticket_deleted,priority:1"`
	DeletedByUserId     int    `json:"deleted_by_user_id"`
	// AttachmentRetentionClaimId gates state changes while the cleanup worker
	// deletes an object referenced by this ticket. The worker clears the
	// matching URLs before releasing the claim.
	AttachmentRetentionClaimId   int64 `json:"-" gorm:"index"`
	AttachmentRetentionClaimedAt int64 `json:"-"`
}

// TicketQueueStats is the support work-queue summary. These values are
// derived from the objective ticket state rather than maintained counters, so
// list filters, detail actions, and dashboard cards cannot drift apart.
type TicketQueueStats struct {
	WaitingOnStaff int64 `json:"waiting_on_staff"`
	WaitingOnUser  int64 `json:"waiting_on_user"`
	Resolved       int64 `json:"resolved"`
	Unassigned     int64 `json:"unassigned"`
	AssignedToMe   int64 `json:"assigned_to_me"`
}

// CountTicketQueues returns every management queue count from one statement.
func CountTicketQueues(staffUserID int) (TicketQueueStats, error) {
	var stats TicketQueueStats
	err := DB.Model(&Ticket{}).
		Select(`
			COALESCE(SUM(CASE WHEN tickets.status = ? AND tickets.waiting_on = ? THEN 1 ELSE 0 END), 0) AS waiting_on_staff,
			COALESCE(SUM(CASE WHEN tickets.status = ? AND tickets.waiting_on = ? THEN 1 ELSE 0 END), 0) AS waiting_on_user,
			COALESCE(SUM(CASE WHEN tickets.status = ? THEN 1 ELSE 0 END), 0) AS resolved,
			COALESCE(SUM(CASE WHEN tickets.status = ? AND tickets.assigned_to IS NULL THEN 1 ELSE 0 END), 0) AS unassigned,
			COALESCE(SUM(CASE WHEN tickets.status = ? AND tickets.assigned_to = ? THEN 1 ELSE 0 END), 0) AS assigned_to_me`, TicketStatusOpen, TicketWaitingOnStaff,
			TicketStatusOpen, TicketWaitingOnUser,
			TicketStatusResolved,
			TicketStatusOpen,
			TicketStatusOpen, staffUserID).
		Where("tickets.deleted_at IS NULL").
		Scan(&stats).Error
	return stats, err
}

func NewTicketPublicID() string {
	return strings.ReplaceAll(uuid.NewString(), "-", "")
}

// nextTicketStateAfterPublicMessage computes the (status, waiting_on) pair
// after a public message from authorKind. It always returns open: a public
// reply from either side reopens a resolved ticket atomically, since there is
// no separate "who is allowed to reopen by replying" rule to encode.
func nextTicketStateAfterPublicMessage(authorKind string) (status, waitingOn string) {
	if authorKind == TicketAuthorKindStaff {
		return TicketStatusOpen, TicketWaitingOnUser
	}
	return TicketStatusOpen, TicketWaitingOnStaff
}

// applyTicketSnapshotCAS is the single path by which every ticket mutation
// (create's own follow-up update, reply, resolve, reopen) writes the mutable
// snapshot fields. Every call is gated on the row still being at
// expectedVersion and on the absence of an attachment-retention claim, so a
// ticket cannot reopen while a referenced object is being deleted.
func applyTicketSnapshotCAS(tx *gorm.DB, ticketID, expectedVersion int64, updates map[string]interface{}) error {
	updates["version"] = expectedVersion + 1
	result := tx.Model(&Ticket{}).
		Where("id = ? AND version = ? AND "+ticketAttachmentRetentionUnclaimedSQL, ticketID, expectedVersion).
		Updates(updates)
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected == 0 {
		return ErrTicketVersionConflict
	}
	return nil
}

// snapshotFieldsForNewMessage returns the CAS update map every new message
// bumps: last_message_* always, plus last_public_message_* and message_count
// when the message is public. CreateTicket and ReplyToTicket insert messages and must agree on this field list;
// centralizing it here means a future field (e.g. last_message_author_kind)
// only needs to change in one place.
func snapshotFieldsForNewMessage(messageID int64, visibility string, now int64) map[string]interface{} {
	updates := map[string]interface{}{
		"last_message_id": messageID,
		"last_message_at": now,
		"message_count":   gorm.Expr("message_count + 1"),
	}
	if visibility == TicketVisibilityPublic {
		updates["last_public_message_id"] = messageID
		updates["last_public_message_at"] = now
	}
	return updates
}

// GetTicketByPublicID loads a ticket regardless of owner (staff path).
func GetTicketByPublicID(publicID string) (*Ticket, error) {
	var ticket Ticket
	if err := DB.Where("public_id = ? AND deleted_at IS NULL", publicID).First(&ticket).Error; err != nil {
		return nil, err
	}
	return &ticket, nil
}

// GetOwnedTicket loads a ticket only if it belongs to userID. The ownership
// predicate lives in the SQL WHERE clause, not a post-fetch check in Go.
func GetOwnedTicket(publicID string, userID int) (*Ticket, error) {
	var ticket Ticket
	if err := DB.Where("public_id = ? AND user_id = ? AND deleted_at IS NULL", publicID, userID).First(&ticket).Error; err != nil {
		return nil, err
	}
	return &ticket, nil
}

// CountOpenTicketsForUser powers the per-user open-ticket cap.
func CountOpenTicketsForUser(userID int) (int64, error) {
	var count int64
	err := DB.Model(&Ticket{}).Where("user_id = ? AND status = ? AND deleted_at IS NULL", userID, TicketStatusOpen).Count(&count).Error
	return count, err
}

// CountTicketsCreatedForUserSince powers the rolling creation-rate cap.
func CountTicketsCreatedForUserSince(userID int, createdSince int64) (int64, error) {
	var count int64
	err := DB.Model(&Ticket{}).Where("user_id = ? AND created_at >= ?", userID, createdSince).Count(&count).Error
	return count, err
}

// CreateTicket opens a ticket with its first public message in one
// transaction: insert ticket, insert message, CAS-apply the resulting
// snapshot, seed the actor's read cursor, and, for customer-created tickets,
// enqueue a staff-facing ticket_created event. attachmentURLs is variadic so
// callers without attachments do not need a separate path.
//
// ownerUserID and actorUserID are deliberately separate: for a user creating
// their own ticket they're the same person, but for staff creating a ticket
// on a user's behalf (AdminCreateTicket) they differ -- ownerUserID is the
// customer the ticket belongs to, actorUserID is the staff member who
// actually wrote this message. Collapsing them into one id (as this function
// used to) made the first message's author_user_id the customer even though
// its author_kind is staff and pre-advanced the customer's own read cursor
// past a message they never saw.
func CreateTicket(ownerUserID, actorUserID int, initiatedBy, category, priority, subject, body, clientRequestID string, attachmentURLs ...string) (*Ticket, *TicketMessage, error) {
	return createTicket(ownerUserID, actorUserID, initiatedBy, category, priority, subject, body, clientRequestID, nil, attachmentURLs...)
}

func CreateTicketWithLimits(ownerUserID, actorUserID int, initiatedBy, category, priority, subject, body, clientRequestID string, limits TicketCreateLimits, attachmentURLs ...string) (*Ticket, *TicketMessage, error) {
	return createTicket(ownerUserID, actorUserID, initiatedBy, category, priority, subject, body, clientRequestID, &limits, attachmentURLs...)
}

func createTicket(ownerUserID, actorUserID int, initiatedBy, category, priority, subject, body, clientRequestID string, limits *TicketCreateLimits, attachmentURLs ...string) (*Ticket, *TicketMessage, error) {
	if err := ValidateTicketCreateInput(initiatedBy, category, priority, subject, body, clientRequestID, attachmentURLs); err != nil {
		return nil, nil, err
	}
	encodedAttachments, err := encodeTicketAttachmentUrls(attachmentURLs)
	if err != nil {
		return nil, nil, err
	}

	authorKind := TicketAuthorKindUser
	waitingOn := TicketWaitingOnStaff
	if initiatedBy == TicketInitiatedByStaff {
		authorKind = TicketAuthorKindStaff
		waitingOn = TicketWaitingOnUser
	}

	var ticket Ticket
	var message TicketMessage
	err = DB.Transaction(func(tx *gorm.DB) error {
		now := common.GetTimestamp()
		if limits != nil && !common.UsingMainDatabase(common.DatabaseTypeSQLite) {
			var owner User
			if err := lockForUpdate(tx).Select("id").Where("id = ?", ownerUserID).First(&owner).Error; err != nil {
				return fmt.Errorf("lock ticket owner: %w", err)
			}
		}

		// Claim (actorUserID, clientRequestID) before creating anything: a
		// retried request (client timeout, double submit) must replay the
		// original ticket instead of opening a second one. TicketMessage's own
		// dedup key is scoped by ticket_id, which doesn't exist yet at create
		// time, so it can't catch this on its own.
		won, existingTicketID, err := reserveTicketCreateRequest(tx, actorUserID, ownerUserID, clientRequestID, now)
		if err != nil {
			return err
		}
		if !won {
			if err := tx.Where("id = ? AND deleted_at IS NULL", existingTicketID).First(&ticket).Error; err != nil {
				if errors.Is(err, gorm.ErrRecordNotFound) {
					return ErrTicketCreateReplayRemoved
				}
				return err
			}
			return tx.Where("ticket_id = ? AND author_user_id = ? AND client_request_id = ?", ticket.Id, actorUserID, clientRequestID).
				First(&message).Error
		}
		if limits != nil {
			var openCount int64
			if err := tx.Model(&Ticket{}).Where("user_id = ? AND status = ? AND deleted_at IS NULL", ownerUserID, TicketStatusOpen).Count(&openCount).Error; err != nil {
				return err
			}
			if limits.MaxOpen > 0 && openCount >= limits.MaxOpen {
				return ErrTooManyOpenTickets{Limit: limits.MaxOpen}
			}
			var createdCount int64
			if err := tx.Model(&Ticket{}).Where("user_id = ? AND created_at >= ?", ownerUserID, limits.CreatedSince).Count(&createdCount).Error; err != nil {
				return err
			}
			if limits.MaxCreated > 0 && createdCount >= limits.MaxCreated {
				return ErrTooManyTicketsCreated{Limit: limits.MaxCreated}
			}
		}

		ticket = Ticket{
			PublicId:    NewTicketPublicID(),
			UserId:      ownerUserID,
			InitiatedBy: initiatedBy,
			Subject:     strings.TrimSpace(subject),
			Category:    category,
			Priority:    priority,
			Status:      TicketStatusOpen,
			WaitingOn:   waitingOn,
			Version:     1,
			CreatedAt:   now,
			UpdatedAt:   now,
		}
		if err := tx.Create(&ticket).Error; err != nil {
			return err
		}
		if err := completeTicketCreateRequest(tx, actorUserID, ownerUserID, clientRequestID, ticket.Id); err != nil {
			return err
		}

		// Re-verify attachment ownership inside this transaction, holding a row
		// lock for the rest of it: the controller's pre-check
		// (validateTicketAttachmentUrlsBelongToCaller) ran before this
		// transaction even started, leaving a window where the cleanup worker
		// could claim and delete an attachment between that check and this
		// message insert. See claimTicketAttachmentUploadsForMessage.
		attachmentKeys, err := ticketAttachmentStorageKeys(tx, attachmentURLs)
		if err != nil {
			return err
		}
		ok, err := claimTicketAttachmentUploadsForMessage(tx, attachmentKeys, actorUserID)
		if err != nil {
			return err
		}
		if !ok {
			return errors.New("attachment url was not uploaded by you, or is no longer available")
		}

		message = TicketMessage{
			TicketId:        ticket.Id,
			AuthorUserId:    actorUserID,
			AuthorKind:      authorKind,
			Visibility:      TicketVisibilityPublic,
			Body:            body,
			ClientRequestId: clientRequestID,
			AttachmentUrls:  encodedAttachments,
			CreatedAt:       now,
		}
		if err := tx.Create(&message).Error; err != nil {
			return err
		}

		updates := snapshotFieldsForNewMessage(message.Id, TicketVisibilityPublic, now)
		if err := applyTicketSnapshotCAS(tx, ticket.Id, ticket.Version, updates); err != nil {
			return err
		}

		// Only the actor (whoever actually wrote this message) has "read" it.
		// For a staff-initiated ticket, the owner (customer) must not have
		// their cursor pre-advanced past a message they haven't seen yet.
		if err := upsertTicketReadCursor(tx, ticket.Id, actorUserID, message.Id, now); err != nil {
			return err
		}
		return tx.Where("id = ?", ticket.Id).First(&ticket).Error
	})
	if err != nil {
		return nil, nil, err
	}
	return &ticket, &message, nil
}

// ReplyToTicket appends a message and, for public replies, CAS-applies the
// resulting objective state (a public reply from either side reopens a
// resolved ticket). A retried request with the same
// (ticket, author, client_request_id) returns the original message instead of
// inserting a duplicate or erroring.
func ReplyToTicket(publicID string, actorUserID int, actorKind, visibility, body, clientRequestID string, attachmentURLs ...string) (*Ticket, *TicketMessage, error) {
	if err := ValidateTicketAuthorKind(actorKind); err != nil {
		return nil, nil, err
	}
	if err := ValidateTicketVisibility(visibility); err != nil {
		return nil, nil, err
	}
	if err := ValidateTicketBody(body); err != nil {
		return nil, nil, err
	}
	if strings.TrimSpace(clientRequestID) == "" {
		return nil, nil, errors.New("client_request_id is required")
	}
	if err := ValidateTicketAttachmentUrls(attachmentURLs); err != nil {
		return nil, nil, err
	}
	encodedAttachments, err := encodeTicketAttachmentUrls(attachmentURLs)
	if err != nil {
		return nil, nil, err
	}

	var ticket Ticket
	var message TicketMessage
	err = DB.Transaction(func(tx *gorm.DB) error {
		if err := lockForUpdate(tx).Where("public_id = ? AND deleted_at IS NULL", publicID).First(&ticket).Error; err != nil {
			return err
		}

		var existing TicketMessage
		err := tx.Where("ticket_id = ? AND author_user_id = ? AND client_request_id = ?", ticket.Id, actorUserID, clientRequestID).
			First(&existing).Error
		if err == nil {
			message = existing
			return nil
		}
		if !errors.Is(err, gorm.ErrRecordNotFound) {
			return err
		}

		// See CreateTicket's identical re-check for why the controller's
		// pre-check alone cannot close the attachment-claim TOCTOU window.
		attachmentKeys, err := ticketAttachmentStorageKeys(tx, attachmentURLs)
		if err != nil {
			return err
		}
		ok, err := claimTicketAttachmentUploadsForMessage(tx, attachmentKeys, actorUserID)
		if err != nil {
			return err
		}
		if !ok {
			return errors.New("attachment url was not uploaded by you, or is no longer available")
		}

		now := common.GetTimestamp()
		message = TicketMessage{
			TicketId:        ticket.Id,
			AuthorUserId:    actorUserID,
			AuthorKind:      actorKind,
			Visibility:      visibility,
			Body:            body,
			ClientRequestId: clientRequestID,
			AttachmentUrls:  encodedAttachments,
			CreatedAt:       now,
		}
		if err := tx.Create(&message).Error; err != nil {
			return err
		}

		updates := snapshotFieldsForNewMessage(message.Id, visibility, now)
		if visibility == TicketVisibilityPublic {
			status, waitingOn := nextTicketStateAfterPublicMessage(actorKind)
			updates["status"] = status
			updates["waiting_on"] = waitingOn
			// A public reply always lands the ticket back at open; a resolved
			// ticket revived this way must not keep its stale resolved_at.
			updates["resolved_at"] = nil
		}
		// Internal notes leave status, waiting_on, and last_public_message_*
		// untouched because they are visible only to staff.

		if err := applyTicketSnapshotCAS(tx, ticket.Id, ticket.Version, updates); err != nil {
			return err
		}
		if err := upsertTicketReadCursor(tx, ticket.Id, actorUserID, message.Id, now); err != nil {
			return err
		}
		return tx.Where("id = ?", ticket.Id).First(&ticket).Error
	})
	if err != nil {
		return nil, nil, err
	}
	return &ticket, &message, nil
}

// ResolveTicket CAS-transitions an open ticket to resolved. A caller whose
// expectedVersion is stale gets ErrTicketVersionConflict; resolving an
// already-resolved ticket at the current version is an idempotent no-op.
// Resolution is visible through the ticket list and ticket state.
func ResolveTicket(publicID string, actorKind string, expectedVersion int64) (*Ticket, error) {
	if err := ValidateTicketAuthorKind(actorKind); err != nil {
		return nil, err
	}
	var ticket Ticket
	err := DB.Transaction(func(tx *gorm.DB) error {
		if err := lockForUpdate(tx).Where("public_id = ? AND deleted_at IS NULL", publicID).First(&ticket).Error; err != nil {
			return err
		}
		if ticket.Version != expectedVersion {
			return ErrTicketVersionConflict
		}
		if ticket.Status == TicketStatusResolved {
			return nil
		}
		now := common.GetTimestamp()
		updates := map[string]interface{}{
			"status":      TicketStatusResolved,
			"waiting_on":  TicketWaitingOnNone,
			"resolved_at": now,
		}
		if err := applyTicketSnapshotCAS(tx, ticket.Id, ticket.Version, updates); err != nil {
			return err
		}
		return tx.Where("id = ?", ticket.Id).First(&ticket).Error
	})
	if err != nil {
		return nil, err
	}
	return &ticket, nil
}

// ReopenTicket CAS-transitions a resolved ticket back to open. actorKind
// decides the resulting waiting_on: a user reopening waits on staff, staff
// reopening waits on the user.
func ReopenTicket(publicID string, actorKind string, expectedVersion int64) (*Ticket, error) {
	if err := ValidateTicketAuthorKind(actorKind); err != nil {
		return nil, err
	}
	var ticket Ticket
	err := DB.Transaction(func(tx *gorm.DB) error {
		if err := lockForUpdate(tx).Where("public_id = ? AND deleted_at IS NULL", publicID).First(&ticket).Error; err != nil {
			return err
		}
		if ticket.Version != expectedVersion {
			return ErrTicketVersionConflict
		}
		if ticket.Status == TicketStatusOpen {
			return nil
		}
		waitingOn := TicketWaitingOnStaff
		if actorKind == TicketAuthorKindStaff {
			waitingOn = TicketWaitingOnUser
		}
		updates := map[string]interface{}{
			"status":      TicketStatusOpen,
			"waiting_on":  waitingOn,
			"resolved_at": nil,
		}
		if err := applyTicketSnapshotCAS(tx, ticket.Id, ticket.Version, updates); err != nil {
			return err
		}
		return tx.Where("id = ?", ticket.Id).First(&ticket).Error
	})
	if err != nil {
		return nil, err
	}
	return &ticket, nil
}

// AssignTicket CAS-sets (or clears, when assigneeUserID is nil) the ticket's assignee.
func AssignTicket(publicID string, assigneeUserID *int, expectedVersion int64) (*Ticket, error) {
	var ticket Ticket
	err := DB.Transaction(func(tx *gorm.DB) error {
		if err := lockForUpdate(tx).Where("public_id = ? AND deleted_at IS NULL", publicID).First(&ticket).Error; err != nil {
			return err
		}
		if ticket.Version != expectedVersion {
			return ErrTicketVersionConflict
		}
		updates := map[string]interface{}{"assigned_to": assigneeUserID}
		if err := applyTicketSnapshotCAS(tx, ticket.Id, ticket.Version, updates); err != nil {
			return err
		}
		return tx.Where("id = ?", ticket.Id).First(&ticket).Error
	})
	if err != nil {
		return nil, err
	}
	return &ticket, nil
}

// SoftDeleteTicket moves an active ticket into recoverable trash while
// retaining its messages, tags, read cursors, and attachments.
func SoftDeleteTicket(publicID string, actorUserID int, expectedVersion int64) (*Ticket, error) {
	var ticket Ticket
	err := DB.Transaction(func(tx *gorm.DB) error {
		if err := lockForUpdate(tx).Where("public_id = ? AND deleted_at IS NULL", publicID).First(&ticket).Error; err != nil {
			return err
		}
		if ticket.Version != expectedVersion {
			return ErrTicketVersionConflict
		}
		now := common.GetTimestamp()
		result := tx.Model(&Ticket{}).
			Where("id = ? AND version = ? AND deleted_at IS NULL AND "+ticketAttachmentRetentionUnclaimedSQL, ticket.Id, expectedVersion).
			Updates(map[string]interface{}{
				"deleted_at":         now,
				"deleted_by_user_id": actorUserID,
				"updated_at":         now,
				"version":            expectedVersion + 1,
			})
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected == 0 {
			return ErrTicketVersionConflict
		}
		return tx.Where("id = ?", ticket.Id).First(&ticket).Error
	})
	if err != nil {
		return nil, err
	}
	return &ticket, nil
}

// RestoreTicket returns one trashed ticket to normal visibility without
// rewriting its conversation state.
func RestoreTicket(publicID string, expectedVersion int64) (*Ticket, error) {
	var ticket Ticket
	err := DB.Transaction(func(tx *gorm.DB) error {
		if err := lockForUpdate(tx).Where("public_id = ? AND deleted_at IS NOT NULL", publicID).First(&ticket).Error; err != nil {
			return err
		}
		if ticket.Version != expectedVersion {
			return ErrTicketVersionConflict
		}
		now := common.GetTimestamp()
		result := tx.Model(&Ticket{}).
			Where("id = ? AND version = ? AND deleted_at IS NOT NULL AND "+ticketAttachmentRetentionUnclaimedSQL, ticket.Id, expectedVersion).
			Updates(map[string]interface{}{
				"deleted_at":         nil,
				"deleted_by_user_id": 0,
				"updated_at":         now,
				"version":            expectedVersion + 1,
			})
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected == 0 {
			return ErrTicketVersionConflict
		}
		return tx.Where("id = ?", ticket.Id).First(&ticket).Error
	})
	if err != nil {
		return nil, err
	}
	return &ticket, nil
}

// TicketListFilter narrows an admin or user ticket listing. Zero values mean
// "no filter" for that field. Keyword is a case-insensitive substring match
// against the ticket subject.
type TicketListFilter struct {
	Status     string
	Category   string
	Priority   string
	Keyword    string
	AssignedTo *int
	Tags       []string
	// VisibilityScope bounds which message visibilities Keyword's body search
	// may match. Empty means "keyword only matches the subject" (the
	// user-facing list's existing behavior, unchanged) — only a caller that
	// has already authorized itself to see a given visibility level (the
	// admin list, which requires authz.TicketRead) may set this.
	VisibilityScope []string
}

// ticketLikeEscaper uses ! instead of backslash because MySQL treats
// backslash as a string-literal escape, while ! is portable across the
// supported MySQL, PostgreSQL, and SQLite dialects.
var ticketLikeEscaper = strings.NewReplacer("!", "!!", "%", "!%", "_", "!_")

func applyTicketListFilter(query *gorm.DB, filter TicketListFilter) *gorm.DB {
	if filter.Status != "" {
		query = query.Where("status = ?", filter.Status)
	}
	if filter.Category != "" {
		query = query.Where("category = ?", filter.Category)
	}
	if filter.Priority != "" {
		query = query.Where("priority = ?", filter.Priority)
	}
	if filter.AssignedTo != nil {
		query = query.Where("assigned_to = ?", *filter.AssignedTo)
	}
	if filter.Keyword != "" {
		escaped := ticketLikeEscaper.Replace(filter.Keyword)
		// LOWER() on both sides keeps the "case-insensitive substring match"
		// contract identical across PostgreSQL (case-sensitive LIKE by
		// default), MySQL, and SQLite (both case-insensitive by default for
		// ASCII collations) — without it the same query silently returns
		// different rows depending on the configured database.
		pattern := "%" + strings.ToLower(escaped) + "%"
		if len(filter.VisibilityScope) > 0 {
			// The body subquery is bound to the caller's authorized
			// VisibilityScope: a keyword that only matches an internal note
			// must never surface a ticket to a filter.VisibilityScope that
			// excludes "internal" (see TestTicketKeywordSearchRespectsVisibilityScope).
			query = query.Where("LOWER(subject) LIKE ? ESCAPE '!' OR id IN (?)", pattern,
				DB.Model(&TicketMessage{}).Select("ticket_id").
					Where("visibility IN ? AND LOWER(body) LIKE ? ESCAPE '!'", filter.VisibilityScope, pattern))
		} else {
			query = query.Where("LOWER(subject) LIKE ? ESCAPE '!'", pattern)
		}
	}
	if len(filter.Tags) > 0 {
		query = query.Where("id IN (?)",
			DB.Model(&TicketTag{}).Select("ticket_id").Where("tag IN ?", normalizeTicketTags(filter.Tags)))
	}
	return query
}

// ListTicketsForUser returns one filtered page of userID's own tickets,
// newest first.
func ListTicketsForUser(userID int, filter TicketListFilter, startIdx, pageSize int) ([]Ticket, int64, error) {
	var tickets []Ticket
	var total int64
	scope := func(q *gorm.DB) *gorm.DB {
		return applyTicketListFilter(q.Where("user_id = ? AND deleted_at IS NULL", userID), filter)
	}
	if err := scope(DB.Model(&Ticket{})).Count(&total).Error; err != nil {
		return nil, 0, err
	}
	err := scope(DB.Model(&Ticket{})).Order("updated_at DESC, id DESC").
		Offset(startIdx).Limit(pageSize).Find(&tickets).Error
	return tickets, total, err
}

// CountTicketsByStatus returns a status -> count map. A nil scopeUserID
// counts across every ticket (admin view); a non-nil value scopes to that
// user's own tickets. Only TicketStatusOpen/TicketStatusResolved keys are
// ever present since those are the only two status values this schema has.
func CountTicketsByStatus(scopeUserID *int) (map[string]int64, error) {
	type statusCount struct {
		Status string
		Count  int64
	}
	query := DB.Model(&Ticket{}).Select("status, COUNT(*) AS count").Where("deleted_at IS NULL").Group("status")
	if scopeUserID != nil {
		query = query.Where("user_id = ?", *scopeUserID)
	}
	var rows []statusCount
	if err := query.Find(&rows).Error; err != nil {
		return nil, err
	}
	result := make(map[string]int64, len(rows))
	for _, row := range rows {
		result[row.Status] = row.Count
	}
	return result, nil
}

// ListTicketsForAdmin returns one filtered page across every ticket, newest
// first.
func ListTicketsForAdmin(filter TicketListFilter, startIdx, pageSize int) ([]Ticket, int64, error) {
	var tickets []Ticket
	var total int64
	if err := applyTicketListFilter(DB.Model(&Ticket{}).Where("deleted_at IS NULL"), filter).Count(&total).Error; err != nil {
		return nil, 0, err
	}
	query := applyTicketListFilter(DB.Model(&Ticket{}).Where("deleted_at IS NULL"), filter)
	err := query.Order("updated_at DESC, id DESC").Offset(startIdx).Limit(pageSize).Find(&tickets).Error
	return tickets, total, err
}

// ListDeletedTickets returns the recoverable trash, newest deletion first.
func ListDeletedTickets(filter TicketListFilter, startIdx, pageSize int) ([]Ticket, int64, error) {
	var tickets []Ticket
	var total int64
	if err := applyTicketListFilter(DB.Model(&Ticket{}).Where("deleted_at IS NOT NULL"), filter).Count(&total).Error; err != nil {
		return nil, 0, err
	}
	query := applyTicketListFilter(DB.Model(&Ticket{}).Where("deleted_at IS NOT NULL"), filter)
	err := query.Order("deleted_at DESC, id DESC").Offset(startIdx).Limit(pageSize).Find(&tickets).Error
	return tickets, total, err
}

// CountTicketsWithUnreadForUser is an aggregate existence count (for a badge),
// not an exact unread message count: it counts userID's own tickets that have
// at least one staff public message past their read cursor. Use
// CountUnreadMessages for the exact count on a single ticket.
func CountTicketsWithUnreadForUser(userID int) (int64, error) {
	var count int64
	err := DB.Model(&Ticket{}).
		Joins("LEFT JOIN ticket_read_cursors ON ticket_read_cursors.ticket_id = tickets.id AND ticket_read_cursors.reader_user_id = ?", userID).
		Where("tickets.user_id = ? AND tickets.deleted_at IS NULL AND tickets.last_public_message_id > COALESCE(ticket_read_cursors.last_read_message_id, 0)", userID).
		Count(&count).Error
	return count, err
}

// CountTicketsWithUnreadForStaff is the staff-side equivalent of
// CountTicketsWithUnreadForUser. Staff see every message including internal
// notes, so it compares against last_message_id (all activity), not just
// public user replies.
func CountTicketsWithUnreadForStaff(readerUserID int) (int64, error) {
	var count int64
	err := DB.Model(&Ticket{}).
		Joins("LEFT JOIN ticket_read_cursors ON ticket_read_cursors.ticket_id = tickets.id AND ticket_read_cursors.reader_user_id = ?", readerUserID).
		Where("tickets.deleted_at IS NULL AND tickets.last_message_id > COALESCE(ticket_read_cursors.last_read_message_id, 0)").
		Count(&count).Error
	return count, err
}

// CountUnreadForTickets returns ticket_id -> unread message count for the
// given ticket ids, scoped to readerUserID's own read cursor. It mirrors
// CountTicketsWithUnreadForStaff's "any message counts" semantics (internal
// notes included, not just public counterpart replies) in a single batched
// query so listing a page of tickets never triggers one query per row.
func CountUnreadForTickets(ticketIDs []int64, readerUserID int) (map[int64]int64, error) {
	return countUnreadForTickets(ticketIDs, readerUserID, nil)
}

// CountUnreadPublicStaffForTickets is the user-facing batch unread query: a
// customer's own messages and staff-only notes never contribute to the badge.
func CountUnreadPublicStaffForTickets(ticketIDs []int64, readerUserID int) (map[int64]int64, error) {
	return countUnreadForTickets(ticketIDs, readerUserID, func(query *gorm.DB) *gorm.DB {
		return query.Where("ticket_messages.visibility = ? AND ticket_messages.author_kind IN ?",
			TicketVisibilityPublic, []string{TicketAuthorKindStaff, TicketAuthorKindSystem})
	})
}

func countUnreadForTickets(ticketIDs []int64, readerUserID int, scope func(*gorm.DB) *gorm.DB) (map[int64]int64, error) {
	if len(ticketIDs) == 0 {
		return map[int64]int64{}, nil
	}
	type unreadRow struct {
		TicketId int64
		Count    int64
	}
	var rows []unreadRow
	query := DB.Model(&TicketMessage{}).
		Select("ticket_messages.ticket_id AS ticket_id, COUNT(*) AS count").
		Joins("LEFT JOIN ticket_read_cursors ON ticket_read_cursors.ticket_id = ticket_messages.ticket_id AND ticket_read_cursors.reader_user_id = ?", readerUserID).
		Where("ticket_messages.ticket_id IN ? AND ticket_messages.id > COALESCE(ticket_read_cursors.last_read_message_id, 0)", ticketIDs)
	if scope != nil {
		query = scope(query)
	}
	err := query.
		Group("ticket_messages.ticket_id").
		Find(&rows).Error
	if err != nil {
		return nil, err
	}
	result := make(map[int64]int64, len(rows))
	for _, row := range rows {
		result[row.TicketId] = row.Count
	}
	return result, nil
}
