package model

import (
	"errors"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// FindTicketCreateReplay returns the ticket/message created by an already
// completed idempotency reservation. Callers use it before policy limits so
// retrying a successful request never turns into a new rate-limit error.
func FindTicketCreateReplay(actorUserID, ownerUserID int, clientRequestID string) (*Ticket, *TicketMessage, bool, error) {
	var request TicketCreateRequest
	err := DB.Where("actor_user_id = ? AND owner_user_id = ? AND client_request_id = ? AND ticket_id > 0",
		actorUserID, ownerUserID, clientRequestID).First(&request).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil, false, nil
	}
	if err != nil {
		return nil, nil, false, err
	}
	var ticket Ticket
	if err := DB.Where("id = ? AND deleted_at IS NULL", request.TicketId).First(&ticket).Error; err != nil {
		return nil, nil, false, err
	}
	var message TicketMessage
	if err := DB.Where("ticket_id = ? AND author_user_id = ? AND client_request_id = ?",
		ticket.Id, actorUserID, clientRequestID).First(&message).Error; err != nil {
		return nil, nil, false, err
	}
	return &ticket, &message, true, nil
}

// TicketCreateRequest dedups ticket-creation requests by (actor_user_id,
// owner_user_id, client_request_id). TicketMessage's own (ticket_id,
// author_user_id, client_request_id) uniqueness only takes effect once a
// ticket already exists, so it cannot catch a duplicate create --
// CreateTicket always generates a fresh ticket_id first, so a client retry
// (timeout, double click) that resubmits the same client_request_id used to
// open a second ticket instead of being recognized as a replay.
//
// owner_user_id is part of the key, not just actor_user_id: AdminCreateTicket
// lets one staff actor create tickets for many different customers, so
// (actor, client_request_id) alone collapses two distinct customers' tickets
// into one if staff ever reuses a client_request_id across them (a buggy or
// retrying admin client) -- the second customer's create would silently
// resolve to the first customer's ticket instead of creating their own.
type TicketCreateRequest struct {
	Id              int64  `json:"id" gorm:"primaryKey"`
	ActorUserId     int    `json:"actor_user_id" gorm:"uniqueIndex:idx_ticket_create_request_actor_owner_request"`
	OwnerUserId     int    `json:"owner_user_id" gorm:"uniqueIndex:idx_ticket_create_request_actor_owner_request"`
	ClientRequestId string `json:"client_request_id" gorm:"type:varchar(191);uniqueIndex:idx_ticket_create_request_actor_owner_request"`
	TicketId        int64  `json:"ticket_id"`
	CreatedAt       int64  `json:"created_at"`
}

// reserveTicketCreateRequest claims (actorUserID, ownerUserID,
// clientRequestID) inside the caller's transaction. It returns ok=true when
// this call won the claim (the caller should proceed to create a new ticket
// and then call completeTicketCreateRequest). It returns ok=false when the
// triple was already claimed -- by an earlier committed request, or by a
// concurrent one that the database's unique-index conflict serializes
// against -- in which case existingTicketID identifies the ticket the
// original request created.
func reserveTicketCreateRequest(tx *gorm.DB, actorUserID, ownerUserID int, clientRequestID string, now int64) (ok bool, existingTicketID int64, err error) {
	row := TicketCreateRequest{ActorUserId: actorUserID, OwnerUserId: ownerUserID, ClientRequestId: clientRequestID, CreatedAt: now}
	result := tx.Clauses(clause.OnConflict{DoNothing: true}).Create(&row)
	if result.Error != nil {
		return false, 0, result.Error
	}
	if result.RowsAffected > 0 {
		return true, 0, nil
	}
	var existing TicketCreateRequest
	if err := tx.Where("actor_user_id = ? AND owner_user_id = ? AND client_request_id = ?", actorUserID, ownerUserID, clientRequestID).First(&existing).Error; err != nil {
		return false, 0, err
	}
	return false, existing.TicketId, nil
}

// completeTicketCreateRequest records the ticket a winning reservation
// created, so a later replay of the same (actor, owner, client_request_id)
// resolves to it.
func completeTicketCreateRequest(tx *gorm.DB, actorUserID, ownerUserID int, clientRequestID string, ticketID int64) error {
	return tx.Model(&TicketCreateRequest{}).
		Where("actor_user_id = ? AND owner_user_id = ? AND client_request_id = ?", actorUserID, ownerUserID, clientRequestID).
		Update("ticket_id", ticketID).Error
}
