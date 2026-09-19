package service

import (
	"errors"
	"fmt"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/model"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func setupTicketServiceTest(t *testing.T) {
	t.Helper()
	original := model.DB
	dsn := "file:" + strings.ReplaceAll(t.Name(), "/", "_") + "?mode=memory&cache=shared&_pragma=busy_timeout(30000)"
	db, err := gorm.Open(sqlite.Open(dsn), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&model.Ticket{}, &model.TicketMessage{}, &model.TicketReadCursor{}, &model.TicketCreateRequest{}, &model.User{}))
	model.DB = db
	t.Cleanup(func() {
		model.DB = original
		if sqlDB, e := db.DB(); e == nil {
			_ = sqlDB.Close()
		}
	})
}

func TestCreateTicketConcurrentBurstCannotExceedRollingLimit(t *testing.T) {
	setupTicketServiceTest(t)

	const attempts = 30
	var wg sync.WaitGroup
	errs := make(chan error, attempts)
	for i := 0; i < attempts; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			_, _, err := CreateTicket(1, model.TicketInitiatedByUser, model.TicketCategoryGeneral, model.TicketPriorityNormal,
				"subject", "body", fmt.Sprintf("concurrent-%d", i))
			errs <- err
		}(i)
	}
	wg.Wait()
	close(errs)

	var accepted int
	for err := range errs {
		if err == nil {
			accepted++
			continue
		}
		var limitErr ErrTooManyTicketsCreated
		require.True(t, errors.As(err, &limitErr), "unexpected concurrent create error: %v", err)
	}
	require.Equal(t, TicketMaxCreatedPer24Hours, accepted)

	var tickets, messages, requests int64
	require.NoError(t, model.DB.Model(&model.Ticket{}).Where("user_id = ?", 1).Count(&tickets).Error)
	require.NoError(t, model.DB.Model(&model.TicketMessage{}).Count(&messages).Error)
	require.NoError(t, model.DB.Model(&model.TicketCreateRequest{}).Count(&requests).Error)
	require.EqualValues(t, TicketMaxCreatedPer24Hours, tickets)
	require.EqualValues(t, TicketMaxCreatedPer24Hours, messages)
	require.EqualValues(t, TicketMaxCreatedPer24Hours, requests)
}

func TestCreateTicketEnforcesOpenTicketCap(t *testing.T) {
	setupTicketServiceTest(t)
	for i := 0; i < TicketMaxOpenPerUser; i++ {
		_, _, err := model.CreateTicket(1, 1, model.TicketInitiatedByUser, model.TicketCategoryGeneral, model.TicketPriorityNormal,
			"subject", "body", fmt.Sprintf("open-cap-%d", i))
		require.NoError(t, err)
	}
	require.NoError(t, model.DB.Model(&model.Ticket{}).Where("user_id = ?", 1).
		Update("created_at", time.Now().Add(-25*time.Hour).Unix()).Error)

	_, _, err := CreateTicket(1, model.TicketInitiatedByUser, model.TicketCategoryGeneral, model.TicketPriorityNormal,
		"one too many", "body", "req-overflow")
	require.Error(t, err)
	var capErr ErrTooManyOpenTickets
	require.ErrorAs(t, err, &capErr)
	require.Equal(t, int64(TicketMaxOpenPerUser), capErr.Limit)

	var count int64
	require.NoError(t, model.DB.Model(&model.Ticket{}).Where("user_id = ?", 1).Count(&count).Error)
	require.Equal(t, int64(TicketMaxOpenPerUser), count, "the rejected create must not persist a row")
}

func TestCreateTicketCapIsPerUser(t *testing.T) {
	setupTicketServiceTest(t)
	for i := 0; i < TicketMaxOpenPerUser; i++ {
		_, _, err := model.CreateTicket(1, 1, model.TicketInitiatedByUser, model.TicketCategoryGeneral, model.TicketPriorityNormal,
			"subject", "body", fmt.Sprintf("per-user-cap-%d", i))
		require.NoError(t, err)
	}
	require.NoError(t, model.DB.Model(&model.Ticket{}).Where("user_id = ?", 1).
		Update("created_at", time.Now().Add(-25*time.Hour).Unix()).Error)
	// A different user is unaffected by user 1's cap.
	_, _, err := CreateTicket(2, model.TicketInitiatedByUser, model.TicketCategoryGeneral, model.TicketPriorityNormal,
		"subject", "body", "u2-req")
	require.NoError(t, err)
}

func TestCreateTicketResolvingFreesUpCapSlot(t *testing.T) {
	setupTicketServiceTest(t)
	var lastTicket *model.Ticket
	for i := 0; i < TicketMaxOpenPerUser; i++ {
		ticket, _, err := model.CreateTicket(1, 1, model.TicketInitiatedByUser, model.TicketCategoryGeneral, model.TicketPriorityNormal,
			"subject", "body", fmt.Sprintf("resolve-cap-%d", i))
		require.NoError(t, err)
		lastTicket = ticket
	}
	require.NoError(t, model.DB.Model(&model.Ticket{}).Where("user_id = ?", 1).
		Update("created_at", time.Now().Add(-25*time.Hour).Unix()).Error)
	_, err := model.ResolveTicket(lastTicket.PublicId, model.TicketAuthorKindUser, lastTicket.Version)
	require.NoError(t, err)

	_, _, err = CreateTicket(1, model.TicketInitiatedByUser, model.TicketCategoryGeneral, model.TicketPriorityNormal,
		"now there's room", "body", "req-after-resolve")
	require.NoError(t, err)
}

func TestCreateTicketEnforcesRolling24HourCap(t *testing.T) {
	setupTicketServiceTest(t)
	for i := 0; i < TicketMaxCreatedPer24Hours; i++ {
		_, _, err := CreateTicket(1, model.TicketInitiatedByUser, model.TicketCategoryGeneral, model.TicketPriorityNormal,
			"subject", "body", fmt.Sprintf("daily-cap-%d", i))
		require.NoError(t, err)
	}

	_, _, err := CreateTicket(1, model.TicketInitiatedByUser, model.TicketCategoryGeneral, model.TicketPriorityNormal,
		"one too many today", "body", "daily-cap-overflow")
	require.Error(t, err)
	var capErr ErrTooManyTicketsCreated
	require.ErrorAs(t, err, &capErr)
	require.Equal(t, int64(TicketMaxCreatedPer24Hours), capErr.Limit)
}

func TestCreateTicketDailyCapAllowsIdempotentReplay(t *testing.T) {
	setupTicketServiceTest(t)
	requestID := "daily-cap-replay"
	var original *model.Ticket
	for i := 0; i < TicketMaxCreatedPer24Hours; i++ {
		id := fmt.Sprintf("daily-replay-%d", i)
		if i == TicketMaxCreatedPer24Hours-1 {
			id = requestID
		}
		ticket, _, err := CreateTicket(1, model.TicketInitiatedByUser, model.TicketCategoryGeneral, model.TicketPriorityNormal,
			"subject", "body", id)
		require.NoError(t, err)
		original = ticket
	}

	replayed, _, err := CreateTicket(1, model.TicketInitiatedByUser, model.TicketCategoryGeneral, model.TicketPriorityNormal,
		"subject", "body", requestID)
	require.NoError(t, err)
	require.Equal(t, original.Id, replayed.Id)
}
