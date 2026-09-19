package service

import (
	"time"

	"github.com/QuantumNous/new-api/model"
)

// TicketMaxOpenPerUser caps how many open tickets one user may have at once.
// It is a hardcoded safety limit for T1; a later phase may move it into the
// versioned ticket settings bundle once that exists, but until then it must
// not silently vary per admin action outside of a code change.
const TicketMaxOpenPerUser = 20

// TicketMaxCreatedPer24Hours bounds successful ticket creation in a rolling
// window. Unlike the open-ticket cap, resolving tickets does not free this
// abuse-prevention allowance.
const TicketMaxCreatedPer24Hours = 5

type ErrTooManyOpenTickets = model.ErrTooManyOpenTickets
type ErrTooManyTicketsCreated = model.ErrTooManyTicketsCreated

func CreateTicket(userID int, initiatedBy, category, priority, subject, body, clientRequestID string, attachmentURLs ...string) (*model.Ticket, *model.TicketMessage, error) {
	return model.CreateTicketWithLimits(userID, userID, initiatedBy, category, priority, subject, body, clientRequestID, model.TicketCreateLimits{
		MaxOpen:      TicketMaxOpenPerUser,
		MaxCreated:   TicketMaxCreatedPer24Hours,
		CreatedSince: time.Now().Add(-24 * time.Hour).Unix(),
	}, attachmentURLs...)
}
