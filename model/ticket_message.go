package model

import "github.com/QuantumNous/new-api/common"

// TicketMessage is one entry in a ticket's conversation. The initial
// description is simply the first public message — there is no separate
// "description" column to keep in sync with the message stream.
// TicketMessage's idempotency key is (ticket_id, author_user_id,
// client_request_id): callers always supply a non-empty client_request_id, so
// unlike NULL, an accidental empty string can never collide silently across
// unrelated retries — model.CreateTicket/ReplyToTicket both reject "".
// idx_ticket_message_ticket_visibility (on TicketId, Visibility) backs the
// keyword-search subquery so it doesn't have to scan every message body.
type TicketMessage struct {
	Id              int64  `json:"id" gorm:"primaryKey"`
	TicketId        int64  `json:"ticket_id" gorm:"index:idx_ticket_message_ticket,priority:1;uniqueIndex:idx_ticket_message_idem,priority:1;index:idx_ticket_message_ticket_visibility,priority:1"`
	AuthorUserId    int    `json:"author_user_id" gorm:"uniqueIndex:idx_ticket_message_idem,priority:2"`
	AuthorKind      string `json:"author_kind" gorm:"type:varchar(16)"`
	Visibility      string `json:"visibility" gorm:"type:varchar(16);index:idx_ticket_message_ticket_visibility,priority:2"`
	Body            string `json:"body" gorm:"type:text"`
	ClientRequestId string `json:"client_request_id" gorm:"type:varchar(64);uniqueIndex:idx_ticket_message_idem,priority:3"`
	// AttachmentUrls is a JSON-encoded array of this server's own storage
	// URLs (never raw user input — see model.ValidateTicketAttachmentUrls and
	// the controller-side storage-domain check). Decode with
	// DecodedAttachmentUrls; the raw column is not exposed via JSON directly
	// so callers can't bypass that decoding.
	AttachmentUrls string `json:"-" gorm:"type:text"`
	CreatedAt      int64  `json:"created_at"`
}

// DecodedAttachmentUrls parses the stored attachment URL array. A blank
// column (the common case: most messages have no attachments) or a parse
// failure both simply return nil — attachments are supplementary metadata,
// not a value worth failing the whole response over.
func (m *TicketMessage) DecodedAttachmentUrls() []string {
	if m.AttachmentUrls == "" {
		return nil
	}
	var urls []string
	if err := common.UnmarshalJsonStr(m.AttachmentUrls, &urls); err != nil {
		return nil
	}
	return urls
}

// encodeTicketAttachmentUrls JSON-encodes urls for storage, or "" for an
// empty/nil list so a message with no attachments has a blank column instead
// of a literal "[]" or "null".
func encodeTicketAttachmentUrls(urls []string) (string, error) {
	if len(urls) == 0 {
		return "", nil
	}
	data, err := common.Marshal(urls)
	if err != nil {
		return "", err
	}
	return string(data), nil
}

// FindTicketMessageByAttachmentURL locates a message that carries url in its
// attachment list, for staff downloads: staff already has TicketRead
// visibility into every ticket, so returning any single matching row (its
// order among ties is otherwise unspecified) is fine here. It must not be
// used for an owner-scoped download check — see
// FindPublicTicketMessageByAttachmentURLForOwner for why.
func FindTicketMessageByAttachmentURL(url string) (*TicketMessage, error) {
	escaped := ticketAttachmentLikeToken(url)
	var message TicketMessage
	err := DB.Table("ticket_messages").
		Select("ticket_messages.*").
		Joins("JOIN tickets ON tickets.id = ticket_messages.ticket_id").
		Where("tickets.deleted_at IS NULL AND ticket_messages.attachment_urls LIKE ? ESCAPE '!'", "%\""+escaped+"\"%").
		First(&message).Error
	if err != nil {
		return nil, err
	}
	return &message, nil
}

// FindPublicTicketMessageByAttachmentURLForOwner locates a public message
// referencing url on a ticket owned by ownerUserID. The same storage key can
// be referenced by more than one message -- e.g. an internal staff note and
// a later public reply -- so filtering by ownership and visibility only
// after fetching an arbitrary matching row (as FindTicketMessageByAttachmentURL
// does) can nondeterministically return the internal-only row and wrongly
// reject a download even though a public reference also exists. Folding the
// ownership and visibility predicates into the query itself removes that
// ambiguity: this call succeeds if and only if a public reference the owner
// may see actually exists.
func FindPublicTicketMessageByAttachmentURLForOwner(url string, ownerUserID int) (*TicketMessage, error) {
	escaped := ticketAttachmentLikeToken(url)
	var message TicketMessage
	err := DB.Table("ticket_messages").
		Select("ticket_messages.*").
		Joins("JOIN tickets ON tickets.id = ticket_messages.ticket_id").
		Where("tickets.user_id = ? AND tickets.deleted_at IS NULL AND ticket_messages.visibility = ? AND ticket_messages.attachment_urls LIKE ? ESCAPE '!'",
			ownerUserID, TicketVisibilityPublic, "%\""+escaped+"\"%").
		First(&message).Error
	if err != nil {
		return nil, err
	}
	return &message, nil
}

// ListTicketMessages returns up to limit messages older than beforeID (0 means
// "start from the newest"), ordered newest-first — a keyset page. Non-staff
// callers never see internal messages regardless of beforeID.
func ListTicketMessages(ticketID int64, includeInternal bool, beforeID int64, limit int) ([]TicketMessage, error) {
	query := DB.Where("ticket_id = ?", ticketID)
	if !includeInternal {
		query = query.Where("visibility = ?", TicketVisibilityPublic)
	}
	if beforeID > 0 {
		query = query.Where("id < ?", beforeID)
	}
	var messages []TicketMessage
	err := query.Order("id DESC").Limit(limit).Find(&messages).Error
	return messages, err
}

func GetFirstPublicTicketMessage(ticketID int64) (*TicketMessage, error) {
	var message TicketMessage
	err := DB.Where("ticket_id = ? AND visibility = ?", ticketID, TicketVisibilityPublic).
		Order("id ASC").
		First(&message).Error
	if err != nil {
		return nil, err
	}
	return &message, nil
}

// CountUnreadMessages counts public messages authored by counterpartKind after
// afterMessageID, scoped to one ticket — the query is always ticket_id-bound,
// so it never double-counts across tickets sharing the same global message id
// space.
func CountUnreadMessages(ticketID int64, afterMessageID int64, counterpartKind string) (int64, error) {
	var count int64
	err := DB.Model(&TicketMessage{}).
		Where("ticket_id = ? AND id > ? AND visibility = ? AND author_kind = ?",
			ticketID, afterMessageID, TicketVisibilityPublic, counterpartKind).
		Count(&count).Error
	return count, err
}
