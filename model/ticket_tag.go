package model

import (
	"errors"
	"fmt"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"gorm.io/gorm/clause"
)

// Tag length bounds are a code constant, not an admin-configurable setting,
// for the same reason as the ticket subject/body bounds in ticket.go.
const (
	TicketTagMinLength = 1
	TicketTagMaxLength = 32
)

// TicketTag is a satellite table, not a comma-joined column on Ticket: a
// dedicated (ticket_id, tag) row can be indexed and filtered in SQL across
// every supported database, and it never touches Ticket.Version — tagging is
// its own small transaction, the same shape as TicketReadCursor.
type TicketTag struct {
	Id        int64  `json:"id" gorm:"primaryKey"`
	TicketId  int64  `json:"ticket_id" gorm:"uniqueIndex:idx_ticket_tag,priority:1;index:idx_ticket_tag_ticket,priority:1"`
	Tag       string `json:"tag" gorm:"type:varchar(32);uniqueIndex:idx_ticket_tag,priority:2"`
	CreatedAt int64  `json:"created_at"`
}

func ValidateTicketTag(tag string) error {
	n := len([]rune(tag))
	if n < TicketTagMinLength || n > TicketTagMaxLength {
		return fmt.Errorf("ticket tag must be %d-%d characters", TicketTagMinLength, TicketTagMaxLength)
	}
	return nil
}

// normalizeTicketTag trims whitespace and lowercases a tag so "Bug", "bug ",
// and "bug" are always treated as the same tag.
func normalizeTicketTag(tag string) string {
	return strings.ToLower(strings.TrimSpace(tag))
}

// normalizeTicketTags applies normalizeTicketTag to every entry, dropping
// blanks and duplicates while preserving first-seen order.
func normalizeTicketTags(tags []string) []string {
	seen := make(map[string]struct{}, len(tags))
	result := make([]string, 0, len(tags))
	for _, raw := range tags {
		tag := normalizeTicketTag(raw)
		if tag == "" {
			continue
		}
		if _, dup := seen[tag]; dup {
			continue
		}
		seen[tag] = struct{}{}
		result = append(result, tag)
	}
	return result
}

// AddTicketTags trims, lowercases, and dedupes tags before validating and
// inserting them. A tag already present on the ticket is silently skipped via
// clause.OnConflict{DoNothing: true} (portable across SQLite/MySQL/Postgres),
// not an error — retrying the same request, or two staff adding the same tag
// concurrently, both converge instead of failing.
func AddTicketTags(ticketID int64, tags []string) error {
	normalized := normalizeTicketTags(tags)
	if len(normalized) == 0 {
		return errors.New("at least one tag is required")
	}
	rows := make([]TicketTag, 0, len(normalized))
	now := common.GetTimestamp()
	for _, tag := range normalized {
		if err := ValidateTicketTag(tag); err != nil {
			return err
		}
		rows = append(rows, TicketTag{TicketId: ticketID, Tag: tag, CreatedAt: now})
	}
	return DB.Clauses(clause.OnConflict{DoNothing: true}).Create(&rows).Error
}

// RemoveTicketTag deletes one tag from a ticket. Removing a tag that isn't
// present is a no-op, not an error.
func RemoveTicketTag(ticketID int64, tag string) error {
	return DB.Where("ticket_id = ? AND tag = ?", ticketID, normalizeTicketTag(tag)).Delete(&TicketTag{}).Error
}

// ListTicketTags returns every tag on one ticket, oldest first.
func ListTicketTags(ticketID int64) ([]string, error) {
	var tags []string
	err := DB.Model(&TicketTag{}).Where("ticket_id = ?", ticketID).
		Order("created_at ASC, id ASC").Pluck("tag", &tags).Error
	return tags, err
}

// ListTicketTagsByTicketIDs loads tags for an entire list page in one query.
func ListTicketTagsByTicketIDs(ticketIDs []int64) (map[int64][]string, error) {
	result := make(map[int64][]string, len(ticketIDs))
	if len(ticketIDs) == 0 {
		return result, nil
	}
	var rows []TicketTag
	if err := DB.Where("ticket_id IN ?", ticketIDs).
		Order("ticket_id ASC, created_at ASC, id ASC").
		Find(&rows).Error; err != nil {
		return nil, err
	}
	for _, row := range rows {
		result[row.TicketId] = append(result[row.TicketId], row.Tag)
	}
	return result, nil
}

// ListTicketIDsByTags returns the ids of every ticket carrying at least one of
// tags — the same "any of these tags" set applyTicketListFilter's Tags branch
// filters a ticket listing by.
func ListTicketIDsByTags(tags []string) ([]int64, error) {
	normalized := normalizeTicketTags(tags)
	if len(normalized) == 0 {
		return nil, nil
	}
	var ids []int64
	err := DB.Model(&TicketTag{}).Where("tag IN ?", normalized).Distinct().Pluck("ticket_id", &ids).Error
	return ids, err
}
