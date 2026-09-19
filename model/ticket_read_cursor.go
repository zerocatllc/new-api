package model

import (
	"errors"

	"github.com/QuantumNous/new-api/common"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// TicketReadCursor is one reader's progress through one ticket's messages.
// The composite primary key means every reader (including every admin) has an
// independent cursor: one admin opening a ticket never clears another admin's
// unread count, and the user's cursor is separate from every staff cursor.
type TicketReadCursor struct {
	TicketId          int64 `json:"ticket_id" gorm:"primaryKey;autoIncrement:false"`
	ReaderUserId      int   `json:"reader_user_id" gorm:"primaryKey;autoIncrement:false"`
	LastReadMessageId int64 `json:"last_read_message_id"`
	UpdatedAt         int64 `json:"updated_at"`
}

// upsertTicketReadCursor advances readerUserID's cursor to targetMessageID,
// never moving it backwards. The WHERE clause on the update makes a stale
// writer's attempt a no-op instead of clobbering a newer cursor — safe even if
// two read operations for the same reader race.
func upsertTicketReadCursor(tx *gorm.DB, ticketID int64, readerUserID int, targetMessageID int64, now int64) error {
	if targetMessageID <= 0 {
		return nil
	}
	var cursor TicketReadCursor
	err := tx.Where("ticket_id = ? AND reader_user_id = ?", ticketID, readerUserID).First(&cursor).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		// OnConflict DoNothing instead of a bare Create: two operations for
		// the same reader can both miss the First above (two tabs marking
		// read concurrently, or a read racing a reply) and a bare second
		// Create would hit the composite primary key and roll back the whole
		// surrounding transaction -- failing a user's reply over read-cursor
		// bookkeeping. On conflict the monotonic UPDATE below still runs and
		// advances whichever row won.
		result := tx.Clauses(clause.OnConflict{DoNothing: true}).Create(&TicketReadCursor{
			TicketId:          ticketID,
			ReaderUserId:      readerUserID,
			LastReadMessageId: targetMessageID,
			UpdatedAt:         now,
		})
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected > 0 {
			return nil
		}
	} else if err != nil {
		return err
	} else if cursor.LastReadMessageId >= targetMessageID {
		return nil
	}
	return tx.Model(&TicketReadCursor{}).
		Where("ticket_id = ? AND reader_user_id = ? AND last_read_message_id < ?", ticketID, readerUserID, targetMessageID).
		Updates(map[string]interface{}{"last_read_message_id": targetMessageID, "updated_at": now}).Error
}

// MarkTicketRead advances readerUserID's cursor to the newest message visible
// to them. Staff see every message including internal notes, so their cap is
// last_message_id; the ticket's own user only ever sees public messages, so
// their cap is last_public_message_id even when a higher-id internal note
// exists. The server computes the target — callers cannot submit an arbitrary
// last_read_at.
func MarkTicketRead(publicID string, readerUserID int, isStaff bool) error {
	return DB.Transaction(func(tx *gorm.DB) error {
		var ticket Ticket
		if err := tx.Where("public_id = ? AND deleted_at IS NULL", publicID).First(&ticket).Error; err != nil {
			return err
		}
		target := ticket.LastPublicMessageId
		if isStaff {
			target = ticket.LastMessageId
		}
		return upsertTicketReadCursor(tx, ticket.Id, readerUserID, target, common.GetTimestamp())
	})
}

// GetTicketReadCursor returns readerUserID's last-read message id for a
// ticket, or 0 if they have never read it.
func GetTicketReadCursor(ticketID int64, readerUserID int) (int64, error) {
	var cursor TicketReadCursor
	err := DB.Where("ticket_id = ? AND reader_user_id = ?", ticketID, readerUserID).First(&cursor).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return 0, nil
	}
	if err != nil {
		return 0, err
	}
	return cursor.LastReadMessageId, nil
}
