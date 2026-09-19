package model

import (
	"os"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/setting/storage_setting"
	"github.com/QuantumNous/new-api/setting/ticket_setting"

	"github.com/glebarez/sqlite"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
	"gorm.io/driver/mysql"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

// withTicketAttachmentStorageBaseForTest configures storage_setting's public
// base URL so ticketAttachmentStorageKeys can strip it, and restores the
// package-level setting afterward. CreateTicket/ReplyToTicket now re-verify
// attachment ownership inside their own transaction (see
// claimTicketAttachmentUploadsForMessage), which needs a configured base URL
// to derive storage keys from -- tests exercising attachment URLs must set
// this up explicitly instead of relying on the pre-fix behavior of trusting
// whatever URL string was passed in.
func withTicketAttachmentStorageBaseForTest(t *testing.T, base string) {
	t.Helper()
	storage_setting.ApplySavedSettings(storage_setting.StorageSettings{
		Enabled:  true,
		Location: storage_setting.StorageLocation{PublicBaseURL: base},
	}, "", false, false)
	t.Cleanup(func() {
		storage_setting.ApplySavedSettings(storage_setting.StorageSettings{}, "", false, false)
	})
}

func TestUpdateTicketSettingsCASCreatesUpdatesAndRejectsStaleVersion(t *testing.T) {
	setupTicketDB(t)
	require.NoError(t, DB.AutoMigrate(&Option{}))
	ticket_setting.ApplySavedSettings(ticket_setting.TicketSettings{})
	t.Cleanup(func() { ticket_setting.ApplySavedSettings(ticket_setting.TicketSettings{}) })

	created, err := UpdateTicketSettingsCAS(0, true)
	require.NoError(t, err)
	require.Equal(t, ticket_setting.TicketSettings{Version: 1, Enabled: true}, created)

	_, err = UpdateTicketSettingsCAS(0, false)
	require.ErrorIs(t, err, ErrTicketSettingsVersionConflict)

	updated, err := UpdateTicketSettingsCAS(1, false)
	require.NoError(t, err)
	require.Equal(t, ticket_setting.TicketSettings{Version: 2, Enabled: false}, updated)
}

func verifyTicketMigration(t *testing.T, db *gorm.DB, databaseType common.DatabaseType) {
	t.Helper()
	originalDB := DB
	originalType := common.MainDatabaseType()
	DB = db
	common.SetMainDatabaseType(databaseType)
	initCol()
	t.Cleanup(func() {
		DB = originalDB
		common.SetMainDatabaseType(originalType)
	})
	require.NoError(t, db.AutoMigrate(&User{}, &Option{}))
	require.NoError(t, db.Create(&User{Id: 9001, Username: "ticket-migration-user", Password: "unused"}).Error)
	require.NoError(t, migrateTicketDB())
	require.NoError(t, migrateTicketDB(), "ticket migration must be idempotent")
	for _, table := range []any{&Ticket{}, &TicketMessage{}, &TicketReadCursor{}, &TicketAttachmentUpload{}, &TicketTag{}, &TicketCreateRequest{}} {
		require.True(t, db.Migrator().HasTable(table))
	}
	var preserved User
	require.NoError(t, db.First(&preserved, 9001).Error)
	require.Equal(t, "ticket-migration-user", preserved.Username)
}

func TestTicketMigrationSQLite(t *testing.T) {
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	verifyTicketMigration(t, db, common.DatabaseTypeSQLite)
}

func TestTicketMigrationConfiguredDatabases(t *testing.T) {
	tests := []struct {
		name      string
		env       string
		typeName  common.DatabaseType
		dialector func(string) gorm.Dialector
	}{
		{name: "mysql", env: "TEST_MYSQL_DSN", typeName: common.DatabaseTypeMySQL, dialector: func(dsn string) gorm.Dialector { return mysql.Open(dsn) }},
		{name: "postgres", env: "TEST_POSTGRES_DSN", typeName: common.DatabaseTypePostgreSQL, dialector: func(dsn string) gorm.Dialector {
			return postgres.New(postgres.Config{DSN: dsn, PreferSimpleProtocol: true})
		}},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			dsn := strings.TrimSpace(os.Getenv(test.env))
			if dsn == "" {
				t.Skip(test.env + " is not configured")
			}
			db, err := gorm.Open(test.dialector(dsn), &gorm.Config{})
			require.NoError(t, err)
			sqlDB, err := db.DB()
			require.NoError(t, err)
			t.Cleanup(func() { _ = sqlDB.Close() })
			verifyTicketMigration(t, db, test.typeName)
		})
	}
}

func setupTicketDB(t *testing.T) {
	t.Helper()
	original := DB
	dsn := "file:" + strings.ReplaceAll(t.Name(), "/", "_") + "?mode=memory&cache=shared"
	db, err := gorm.Open(sqlite.Open(dsn), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&Ticket{}, &TicketMessage{}, &TicketReadCursor{}, &TicketAttachmentUpload{}, &TicketTag{}, &TicketCreateRequest{}, &User{}))
	DB = db
	t.Cleanup(func() {
		DB = original
		if sqlDB, e := db.DB(); e == nil {
			_ = sqlDB.Close()
		}
	})
}

func TestCountTicketQueuesUsesObjectiveStateAndCurrentAssignee(t *testing.T) {
	setupTicketDB(t)
	wantStaff, _, err := CreateTicket(1, 1, TicketInitiatedByUser, TicketCategoryGeneral, TicketPriorityHigh, "staff", "body", "queue-1")
	require.NoError(t, err)
	wantUser, _, err := CreateTicket(2, 2, TicketInitiatedByUser, TicketCategoryGeneral, TicketPriorityNormal, "user", "body", "queue-2")
	require.NoError(t, err)
	_, _, err = ReplyToTicket(wantUser.PublicId, 10, TicketAuthorKindStaff, TicketVisibilityPublic, "answer", "queue-reply")
	require.NoError(t, err)
	resolved, _, err := CreateTicket(3, 3, TicketInitiatedByUser, TicketCategoryGeneral, TicketPriorityLow, "resolved", "body", "queue-3")
	require.NoError(t, err)
	_, err = ResolveTicket(resolved.PublicId, TicketAuthorKindStaff, resolved.Version)
	require.NoError(t, err)
	assignee := 10
	_, err = AssignTicket(wantStaff.PublicId, &assignee, wantStaff.Version)
	require.NoError(t, err)

	stats, err := CountTicketQueues(10)
	require.NoError(t, err)
	require.Equal(t, int64(1), stats.WaitingOnStaff)
	require.Equal(t, int64(1), stats.WaitingOnUser)
	require.Equal(t, int64(1), stats.Resolved)
	require.Equal(t, int64(1), stats.Unassigned)
	require.Equal(t, int64(1), stats.AssignedToMe)
}

// mustCreateTicket generates a fresh client_request_id per call so repeated
// calls for the same userID within one test create distinct tickets, rather
// than being deduped as retries of each other -- see CreateTicket's
// reserveTicketCreateRequest.
func mustCreateTicket(t *testing.T, userID int) (*Ticket, *TicketMessage) {
	t.Helper()
	ticket, message, err := CreateTicket(userID, userID, TicketInitiatedByUser, TicketCategoryGeneral, TicketPriorityNormal, "help please", "my request body", "create-req-"+uuid.NewString())
	require.NoError(t, err)
	return ticket, message
}

// --- validation ---

func TestValidateTicketEnumsRejectUnknown(t *testing.T) {
	require.Error(t, ValidateTicketCategory("nonsense"))
	require.NoError(t, ValidateTicketCategory(TicketCategoryBug))
	require.Error(t, ValidateTicketPriority("urgent"))
	require.NoError(t, ValidateTicketPriority(TicketPriorityCritical))
	require.Error(t, ValidateTicketInitiatedBy("bot"))
	require.Error(t, ValidateTicketAuthorKind("bot"))
	require.Error(t, ValidateTicketVisibility("secret"))
}

func TestValidateTicketLengthBounds(t *testing.T) {
	require.Error(t, ValidateTicketSubject(""))
	require.Error(t, ValidateTicketSubject(strings.Repeat("x", 201)))
	require.NoError(t, ValidateTicketSubject(strings.Repeat("x", 200)))
	require.Error(t, ValidateTicketBody(""))
	require.Error(t, ValidateTicketBody(strings.Repeat("x", 5001)))
	require.NoError(t, ValidateTicketBody("x"))
}

// --- create ---

func TestCreateTicketSetsInitialSnapshot(t *testing.T) {
	setupTicketDB(t)
	ticket, message := mustCreateTicket(t, 7)

	require.Equal(t, TicketStatusOpen, ticket.Status)
	require.Equal(t, TicketWaitingOnStaff, ticket.WaitingOn)
	require.Equal(t, int64(2), ticket.Version) // 1 (insert) -> 2 (snapshot CAS)
	require.Equal(t, message.Id, ticket.LastMessageId)
	require.Equal(t, message.Id, ticket.LastPublicMessageId)
	require.Equal(t, 1, ticket.MessageCount)
	require.NotEmpty(t, ticket.PublicId)

	cursor, err := GetTicketReadCursor(ticket.Id, 7)
	require.NoError(t, err)
	require.Equal(t, message.Id, cursor)

}

// TestCreateTicketRetryWithSameClientRequestIdReturnsOriginalTicket is a
// regression test: CreateTicket used to always mint a fresh ticket_id before
// any dedup check could apply, so a client retry (timeout, double submit)
// with the same client_request_id opened a second ticket instead of
// replaying the first.
func TestCreateTicketRetryWithSameClientRequestIdReturnsOriginalTicket(t *testing.T) {
	setupTicketDB(t)
	first, firstMessage, err := CreateTicket(7, 7, TicketInitiatedByUser, TicketCategoryGeneral, TicketPriorityNormal, "s", "b", "retry-req-1")
	require.NoError(t, err)

	second, secondMessage, err := CreateTicket(7, 7, TicketInitiatedByUser, TicketCategoryGeneral, TicketPriorityNormal, "s", "b", "retry-req-1")
	require.NoError(t, err)

	require.Equal(t, first.Id, second.Id, "a retried create with the same client_request_id must return the original ticket, not open a new one")
	require.Equal(t, firstMessage.Id, secondMessage.Id)

	var ticketCount int64
	require.NoError(t, DB.Model(&Ticket{}).Where("user_id = ?", 7).Count(&ticketCount).Error)
	require.Equal(t, int64(1), ticketCount)
}

// TestCreateTicketDifferentActorsCanReuseSameClientRequestId proves the dedup
// key is scoped per actor: two different users independently generating the
// same client_request_id (e.g. a client-side counter reset) must not collide
// with each other.
func TestCreateTicketDifferentActorsCanReuseSameClientRequestId(t *testing.T) {
	setupTicketDB(t)
	ticketA, _, err := CreateTicket(7, 7, TicketInitiatedByUser, TicketCategoryGeneral, TicketPriorityNormal, "s", "b", "shared-req-id")
	require.NoError(t, err)
	ticketB, _, err := CreateTicket(8, 8, TicketInitiatedByUser, TicketCategoryGeneral, TicketPriorityNormal, "s", "b", "shared-req-id")
	require.NoError(t, err)

	require.NotEqual(t, ticketA.Id, ticketB.Id)
}

// TestCreateTicketSameActorDifferentOwnersCanReuseSameClientRequestId is a
// regression test for AdminCreateTicket, the one call path where actor and
// owner deliberately differ: a single staff actor (id=100) creating tickets
// for two different customers must not have the second customer's create
// collapse into the first customer's ticket just because staff (accidentally
// or via a retrying admin client) reused the same client_request_id. Before
// the fix, the dedup key was (actor_user_id, client_request_id) only, so this
// exact shape silently returned customer A's ticket instead of creating one
// for customer B.
func TestCreateTicketSameActorDifferentOwnersCanReuseSameClientRequestId(t *testing.T) {
	setupTicketDB(t)
	const staffActorID = 100
	ticketForCustomerA, _, err := CreateTicket(3, staffActorID, TicketInitiatedByStaff, TicketCategoryGeneral, TicketPriorityNormal, "s", "b", "shared-admin-req-id")
	require.NoError(t, err)
	ticketForCustomerB, _, err := CreateTicket(4, staffActorID, TicketInitiatedByStaff, TicketCategoryGeneral, TicketPriorityNormal, "s", "b", "shared-admin-req-id")
	require.NoError(t, err)

	require.NotEqual(t, ticketForCustomerA.Id, ticketForCustomerB.Id,
		"the same staff actor creating tickets for two different customers must not collapse into one ticket")
	require.Equal(t, 3, ticketForCustomerA.UserId)
	require.Equal(t, 4, ticketForCustomerB.UserId)
}

func TestCreateTicketStaffInitiatedWaitsOnUser(t *testing.T) {
	setupTicketDB(t)
	ticket, _, err := CreateTicket(3, 100, TicketInitiatedByStaff, TicketCategoryBilling, TicketPriorityLow, "on behalf of user", "body text", "create-req-2")
	require.NoError(t, err)
	require.Equal(t, TicketWaitingOnUser, ticket.WaitingOn)
}

// TestCreateTicketStaffInitiatedSeparatesOwnerFromActor pins the owner/actor
// split: staff (100) creating a ticket for a customer (3) must not have the
// customer end up as the message author or pre-advance the customer's own
// read cursor past a message they haven't seen. The unread ticket list is the
// customer notification; the ticket list's unread state is authoritative.
func TestCreateTicketStaffInitiatedSeparatesOwnerFromActor(t *testing.T) {
	setupTicketDB(t)
	ticket, message, err := CreateTicket(3, 100, TicketInitiatedByStaff, TicketCategoryBilling, TicketPriorityLow, "on behalf of user", "body text", "create-req-owner-actor")
	require.NoError(t, err)
	require.Equal(t, 3, ticket.UserId, "the ticket belongs to the customer")
	require.Equal(t, 100, message.AuthorUserId, "the message's author is the staff member who actually wrote it, not the customer")
	require.Equal(t, TicketAuthorKindStaff, message.AuthorKind)

	var actorCursor TicketReadCursor
	require.NoError(t, DB.Where("ticket_id = ? AND reader_user_id = ?", ticket.Id, 100).First(&actorCursor).Error)
	require.Equal(t, message.Id, actorCursor.LastReadMessageId, "the staff actor has seen the message they just wrote")

	var ownerCursorCount int64
	require.NoError(t, DB.Model(&TicketReadCursor{}).Where("ticket_id = ? AND reader_user_id = ?", ticket.Id, 3).Count(&ownerCursorCount).Error)
	require.Zero(t, ownerCursorCount, "the customer's own read cursor must not be pre-advanced past a message they haven't seen")

}

func TestCreateTicketRejectsInvalidInput(t *testing.T) {
	setupTicketDB(t)
	_, _, err := CreateTicket(1, 1, TicketInitiatedByUser, "bogus", TicketPriorityLow, "s", "b", "req")
	require.Error(t, err)
	_, _, err = CreateTicket(1, 1, TicketInitiatedByUser, TicketCategoryGeneral, TicketPriorityLow, "", "b", "req")
	require.Error(t, err)
	_, _, err = CreateTicket(1, 1, TicketInitiatedByUser, TicketCategoryGeneral, TicketPriorityLow, "s", "b", "")
	require.Error(t, err)

	var count int64
	require.NoError(t, DB.Model(&Ticket{}).Count(&count).Error)
	require.Zero(t, count, "no partial rows on validation failure")
}

func TestGetFirstPublicTicketMessageSkipsInternalNotes(t *testing.T) {
	setupTicketDB(t)
	ticket, first := mustCreateTicket(t, 7)
	require.NoError(t, DB.Create(&TicketMessage{
		TicketId:        ticket.Id,
		AuthorUserId:    100,
		AuthorKind:      TicketAuthorKindStaff,
		Visibility:      TicketVisibilityInternal,
		Body:            "internal",
		ClientRequestId: "internal-first-test",
	}).Error)

	message, err := GetFirstPublicTicketMessage(ticket.Id)
	require.NoError(t, err)
	require.Equal(t, first.Id, message.Id)
}

// --- reply state machine ---

func TestReplyUserThenStaffTransitions(t *testing.T) {
	setupTicketDB(t)
	ticket, _ := mustCreateTicket(t, 7)

	updated, msg, err := ReplyToTicket(ticket.PublicId, 100, TicketAuthorKindStaff, TicketVisibilityPublic, "staff reply", "reply-1")
	require.NoError(t, err)
	require.Equal(t, TicketStatusOpen, updated.Status)
	require.Equal(t, TicketWaitingOnUser, updated.WaitingOn)
	require.Equal(t, 2, updated.MessageCount)
	require.Equal(t, msg.Id, updated.LastPublicMessageId)

	updated, _, err = ReplyToTicket(ticket.PublicId, 7, TicketAuthorKindUser, TicketVisibilityPublic, "user reply", "reply-2")
	require.NoError(t, err)
	require.Equal(t, TicketWaitingOnStaff, updated.WaitingOn)
	require.Equal(t, 3, updated.MessageCount)
}

func TestInternalNoteDoesNotChangeState(t *testing.T) {
	setupTicketDB(t)
	ticket, _ := mustCreateTicket(t, 7)

	updated, _, err := ReplyToTicket(ticket.PublicId, 100, TicketAuthorKindStaff, TicketVisibilityInternal, "internal note", "note-1")
	require.NoError(t, err)
	require.Equal(t, ticket.WaitingOn, updated.WaitingOn, "internal note must not change waiting_on")
	require.Equal(t, ticket.LastPublicMessageId, updated.LastPublicMessageId, "internal note must not become the public snapshot")
	require.Equal(t, 2, updated.MessageCount)

}

func TestInternalNoteHiddenFromNonStaffListing(t *testing.T) {
	setupTicketDB(t)
	ticket, _ := mustCreateTicket(t, 7)
	_, _, err := ReplyToTicket(ticket.PublicId, 100, TicketAuthorKindStaff, TicketVisibilityInternal, "internal only", "note-1")
	require.NoError(t, err)

	userView, err := ListTicketMessages(ticket.Id, false, 0, 50)
	require.NoError(t, err)
	require.Len(t, userView, 1, "user must only see the original public message")

	staffView, err := ListTicketMessages(ticket.Id, true, 0, 50)
	require.NoError(t, err)
	require.Len(t, staffView, 2, "staff must see the internal note too")
}

func TestResolvedTicketReopensAtomicallyOnUserReply(t *testing.T) {
	setupTicketDB(t)
	ticket, _ := mustCreateTicket(t, 7)
	resolved, err := ResolveTicket(ticket.PublicId, TicketAuthorKindStaff, ticket.Version)
	require.NoError(t, err)
	require.Equal(t, TicketStatusResolved, resolved.Status)

	reopened, _, err := ReplyToTicket(ticket.PublicId, 7, TicketAuthorKindUser, TicketVisibilityPublic, "still broken", "reply-after-resolve")
	require.NoError(t, err)
	require.Equal(t, TicketStatusOpen, reopened.Status)
	require.Equal(t, TicketWaitingOnStaff, reopened.WaitingOn)
}

// --- idempotency ---

func TestReplyIdempotencyReturnsOriginalMessage(t *testing.T) {
	setupTicketDB(t)
	ticket, _ := mustCreateTicket(t, 7)

	updated1, msg1, err := ReplyToTicket(ticket.PublicId, 100, TicketAuthorKindStaff, TicketVisibilityPublic, "first attempt", "retry-key")
	require.NoError(t, err)

	updated2, msg2, err := ReplyToTicket(ticket.PublicId, 100, TicketAuthorKindStaff, TicketVisibilityPublic, "first attempt", "retry-key")
	require.NoError(t, err)

	require.Equal(t, msg1.Id, msg2.Id, "retried request must return the same message, not insert a duplicate")
	require.Equal(t, updated1.Version, updated2.Version, "a no-op retry must not bump the version again")

	var count int64
	require.NoError(t, DB.Model(&TicketMessage{}).Where("ticket_id = ? AND client_request_id = ?", ticket.Id, "retry-key").Count(&count).Error)
	require.Equal(t, int64(1), count)
}

func TestReplyDifferentAuthorsCanReuseSameClientRequestID(t *testing.T) {
	setupTicketDB(t)
	ticket, _ := mustCreateTicket(t, 7)
	_, msgA, err := ReplyToTicket(ticket.PublicId, 100, TicketAuthorKindStaff, TicketVisibilityPublic, "staff msg", "shared-key")
	require.NoError(t, err)
	_, msgB, err := ReplyToTicket(ticket.PublicId, 7, TicketAuthorKindUser, TicketVisibilityPublic, "user msg", "shared-key")
	require.NoError(t, err)
	require.NotEqual(t, msgA.Id, msgB.Id, "idempotency key is scoped per-author, not global")
}

// --- CAS / version conflict ---

func TestResolveRejectsStaleVersion(t *testing.T) {
	setupTicketDB(t)
	ticket, _ := mustCreateTicket(t, 7)
	_, err := ResolveTicket(ticket.PublicId, TicketAuthorKindStaff, ticket.Version-1) // stale on purpose
	require.ErrorIs(t, err, ErrTicketVersionConflict)

	reloaded, err := GetTicketByPublicID(ticket.PublicId)
	require.NoError(t, err)
	require.Equal(t, TicketStatusOpen, reloaded.Status, "rejected CAS must not mutate the row")
}

func TestResolveIsIdempotentAtCurrentVersion(t *testing.T) {
	setupTicketDB(t)
	ticket, _ := mustCreateTicket(t, 7)
	first, err := ResolveTicket(ticket.PublicId, TicketAuthorKindStaff, ticket.Version)
	require.NoError(t, err)

	second, err := ResolveTicket(ticket.PublicId, TicketAuthorKindStaff, first.Version)
	require.NoError(t, err)
	require.Equal(t, TicketStatusResolved, second.Status)
}

func TestReopenSetsWaitingOnByActor(t *testing.T) {
	setupTicketDB(t)
	ticket, _ := mustCreateTicket(t, 7)
	resolved, err := ResolveTicket(ticket.PublicId, TicketAuthorKindStaff, ticket.Version)
	require.NoError(t, err)

	reopenedByUser, err := ReopenTicket(ticket.PublicId, TicketAuthorKindUser, resolved.Version)
	require.NoError(t, err)
	require.Equal(t, TicketStatusOpen, reopenedByUser.Status)
	require.Equal(t, TicketWaitingOnStaff, reopenedByUser.WaitingOn)

	resolvedAgain, err := ResolveTicket(ticket.PublicId, TicketAuthorKindStaff, reopenedByUser.Version)
	require.NoError(t, err)
	reopenedByStaff, err := ReopenTicket(ticket.PublicId, TicketAuthorKindStaff, resolvedAgain.Version)
	require.NoError(t, err)
	require.Equal(t, TicketWaitingOnUser, reopenedByStaff.WaitingOn)
}

func TestReopenRejectsStaleVersion(t *testing.T) {
	setupTicketDB(t)
	ticket, _ := mustCreateTicket(t, 7)
	resolved, err := ResolveTicket(ticket.PublicId, TicketAuthorKindStaff, ticket.Version)
	require.NoError(t, err)

	_, err = ReopenTicket(ticket.PublicId, TicketAuthorKindUser, resolved.Version+1)
	require.ErrorIs(t, err, ErrTicketVersionConflict)
}

// --- ownership scoping ---

func TestGetOwnedTicketScopesByUser(t *testing.T) {
	setupTicketDB(t)
	ticket, _ := mustCreateTicket(t, 7)

	_, err := GetOwnedTicket(ticket.PublicId, 7)
	require.NoError(t, err)
	_, err = GetOwnedTicket(ticket.PublicId, 999)
	require.Error(t, err, "a different user must not be able to load the ticket by public id")
}

// --- read cursors ---

func TestReadCursorsAreIndependentPerReader(t *testing.T) {
	setupTicketDB(t)
	ticket, firstMsg := mustCreateTicket(t, 7)
	_, staffMsg, err := ReplyToTicket(ticket.PublicId, 100, TicketAuthorKindStaff, TicketVisibilityPublic, "staff reply", "r1")
	require.NoError(t, err)

	// Admin 100 already has a cursor from replying; advance a second admin (200)
	// independently and confirm admin 100's cursor is untouched.
	require.NoError(t, MarkTicketRead(ticket.PublicId, 200, true))

	cursor100, err := GetTicketReadCursor(ticket.Id, 100)
	require.NoError(t, err)
	require.Equal(t, staffMsg.Id, cursor100)

	cursor200, err := GetTicketReadCursor(ticket.Id, 200)
	require.NoError(t, err)
	require.Equal(t, staffMsg.Id, cursor200)
	require.NotEqual(t, firstMsg.Id, cursor200, "sanity: cursor advanced past the first message")
}

func TestMarkTicketReadCapsAtPublicMessageForNonStaff(t *testing.T) {
	setupTicketDB(t)
	ticket, _ := mustCreateTicket(t, 7)
	_, internalMsg, err := ReplyToTicket(ticket.PublicId, 100, TicketAuthorKindStaff, TicketVisibilityInternal, "internal", "note-1")
	require.NoError(t, err)

	require.NoError(t, MarkTicketRead(ticket.PublicId, 7, false))
	cursor, err := GetTicketReadCursor(ticket.Id, 7)
	require.NoError(t, err)
	require.Less(t, cursor, internalMsg.Id, "a non-staff reader's cursor must never reach an internal-only message id")
}

func TestReadCursorNeverMovesBackwards(t *testing.T) {
	setupTicketDB(t)
	ticket, _ := mustCreateTicket(t, 7)
	_, msg2, err := ReplyToTicket(ticket.PublicId, 100, TicketAuthorKindStaff, TicketVisibilityPublic, "reply", "r1")
	require.NoError(t, err)
	require.NoError(t, MarkTicketRead(ticket.PublicId, 7, false))

	cursor, err := GetTicketReadCursor(ticket.Id, 7)
	require.NoError(t, err)
	require.Equal(t, msg2.Id, cursor)

	// Directly force a stale (lower) target and confirm it's refused.
	err = DB.Transaction(func(tx *gorm.DB) error {
		return upsertTicketReadCursor(tx, ticket.Id, 7, 1, 999999)
	})
	require.NoError(t, err)
	cursorAfter, err := GetTicketReadCursor(ticket.Id, 7)
	require.NoError(t, err)
	require.Equal(t, msg2.Id, cursorAfter, "cursor must not regress")
}

// --- unread counting ---

func TestCountUnreadMessagesScopedPerTicket(t *testing.T) {
	setupTicketDB(t)
	ticketA, _ := mustCreateTicket(t, 7)
	ticketB, _, err := CreateTicket(8, 8, TicketInitiatedByUser, TicketCategoryGeneral, TicketPriorityNormal, "another", "body", "create-req-b")
	require.NoError(t, err)

	_, _, err = ReplyToTicket(ticketA.PublicId, 100, TicketAuthorKindStaff, TicketVisibilityPublic, "reply A", "r-a")
	require.NoError(t, err)
	_, _, err = ReplyToTicket(ticketB.PublicId, 100, TicketAuthorKindStaff, TicketVisibilityPublic, "reply B", "r-b")
	require.NoError(t, err)

	unreadA, err := CountUnreadMessages(ticketA.Id, 0, TicketAuthorKindStaff)
	require.NoError(t, err)
	require.Equal(t, int64(1), unreadA, "must not count ticket B's staff reply")
}

func TestCountUnreadForTicketsBatchesAcrossTickets(t *testing.T) {
	setupTicketDB(t)
	ticketA, _ := mustCreateTicket(t, 7)
	ticketB, _, err := CreateTicket(8, 8, TicketInitiatedByUser, TicketCategoryGeneral, TicketPriorityNormal, "another", "body", "create-req-b")
	require.NoError(t, err)
	ticketC, _, err := CreateTicket(9, 9, TicketInitiatedByUser, TicketCategoryGeneral, TicketPriorityNormal, "third", "body", "create-req-c")
	require.NoError(t, err)

	_, _, err = ReplyToTicket(ticketA.PublicId, 100, TicketAuthorKindStaff, TicketVisibilityPublic, "reply A1", "r-a1")
	require.NoError(t, err)
	_, _, err = ReplyToTicket(ticketA.PublicId, 100, TicketAuthorKindStaff, TicketVisibilityPublic, "reply A2", "r-a2")
	require.NoError(t, err)
	_, _, err = ReplyToTicket(ticketB.PublicId, 100, TicketAuthorKindStaff, TicketVisibilityPublic, "reply B", "r-b")
	require.NoError(t, err)
	require.NoError(t, MarkTicketRead(ticketC.PublicId, 55, true))

	result, err := CountUnreadForTickets([]int64{ticketA.Id, ticketB.Id, ticketC.Id}, 55)
	require.NoError(t, err)
	require.Equal(t, int64(3), result[ticketA.Id], "reader 55 never read ticket A: the creation message plus both replies all count")
	require.Equal(t, int64(2), result[ticketB.Id], "reader 55 never read ticket B: the creation message plus the reply count")
	require.Zero(t, result[ticketC.Id], "reader 55 already marked ticket C read, so nothing is unread")

	empty, err := CountUnreadForTickets(nil, 55)
	require.NoError(t, err)
	require.Empty(t, empty)
}

// --- keyset pagination ---

func TestListTicketMessagesKeysetPagination(t *testing.T) {
	setupTicketDB(t)
	ticket, first := mustCreateTicket(t, 7)
	var last *TicketMessage
	for i := 0; i < 4; i++ {
		_, msg, err := ReplyToTicket(ticket.PublicId, 100, TicketAuthorKindStaff, TicketVisibilityPublic, "reply", requestIDFor(i))
		require.NoError(t, err)
		last = msg
	}

	page1, err := ListTicketMessages(ticket.Id, true, 0, 2)
	require.NoError(t, err)
	require.Len(t, page1, 2)
	require.Equal(t, last.Id, page1[0].Id, "newest first")

	page2, err := ListTicketMessages(ticket.Id, true, page1[len(page1)-1].Id, 2)
	require.NoError(t, err)
	require.Len(t, page2, 2)
	require.Less(t, page2[0].Id, page1[len(page1)-1].Id)

	// 5 messages total (1 create + 4 replies), page size 2: a 3rd page reaches
	// the oldest message and a 4th page is empty (pagination terminates).
	page3, err := ListTicketMessages(ticket.Id, true, page2[len(page2)-1].Id, 2)
	require.NoError(t, err)
	require.Len(t, page3, 1)
	require.Equal(t, first.Id, page3[0].Id, "oldest message reached at the end")

	page4, err := ListTicketMessages(ticket.Id, true, page3[len(page3)-1].Id, 2)
	require.NoError(t, err)
	require.Empty(t, page4, "pagination terminates past the oldest message")
}

func requestIDFor(i int) string {
	return "keyset-req-" + string(rune('a'+i))
}

// --- open-ticket cap query surface ---

func TestCountOpenTicketsForUser(t *testing.T) {
	setupTicketDB(t)
	mustCreateTicket(t, 42)
	ticket2, _, err := CreateTicket(42, 42, TicketInitiatedByUser, TicketCategoryGeneral, TicketPriorityNormal, "second", "body", "create-req-second")
	require.NoError(t, err)

	count, err := CountOpenTicketsForUser(42)
	require.NoError(t, err)
	require.Equal(t, int64(2), count)

	_, err = ResolveTicket(ticket2.PublicId, TicketAuthorKindUser, ticket2.Version)
	require.NoError(t, err)
	count, err = CountOpenTicketsForUser(42)
	require.NoError(t, err)
	require.Equal(t, int64(1), count)
}

func TestListTicketsForUserAppliesKeywordAndStatusFilter(t *testing.T) {
	setupTicketDB(t)
	billing, _, err := CreateTicket(42, 42, TicketInitiatedByUser, TicketCategoryBilling, TicketPriorityNormal, "billing question", "body", "create-req-billing")
	require.NoError(t, err)
	_, _, err = CreateTicket(42, 42, TicketInitiatedByUser, TicketCategoryGeneral, TicketPriorityNormal, "general question", "body", "create-req-general")
	require.NoError(t, err)

	tickets, total, err := ListTicketsForUser(42, TicketListFilter{Keyword: "billing"}, 0, 20)
	require.NoError(t, err)
	require.Equal(t, int64(1), total)
	require.Len(t, tickets, 1)
	require.Equal(t, billing.PublicId, tickets[0].PublicId)

	_, err = ResolveTicket(billing.PublicId, TicketAuthorKindUser, billing.Version)
	require.NoError(t, err)
	tickets, total, err = ListTicketsForUser(42, TicketListFilter{Status: TicketStatusResolved}, 0, 20)
	require.NoError(t, err)
	require.Equal(t, int64(1), total)
	require.Equal(t, billing.PublicId, tickets[0].PublicId)

	tickets, total, err = ListTicketsForUser(99, TicketListFilter{}, 0, 20)
	require.NoError(t, err)
	require.Zero(t, total)
	require.Empty(t, tickets)
}

func TestListTicketsForUserKeywordEscapesLikeWildcards(t *testing.T) {
	setupTicketDB(t)
	_, _, err := CreateTicket(42, 42, TicketInitiatedByUser, TicketCategoryGeneral, TicketPriorityNormal, "100% refund_needed", "body", "create-req-wild")
	require.NoError(t, err)
	_, _, err = CreateTicket(42, 42, TicketInitiatedByUser, TicketCategoryGeneral, TicketPriorityNormal, "bang! literal", "body", "create-req-bang")
	require.NoError(t, err)
	_, _, err = CreateTicket(42, 42, TicketInitiatedByUser, TicketCategoryGeneral, TicketPriorityNormal, "unrelated subject", "body", "create-req-other")
	require.NoError(t, err)

	tickets, total, err := ListTicketsForUser(42, TicketListFilter{Keyword: "100% refund_needed"}, 0, 20)
	require.NoError(t, err)
	require.Equal(t, int64(1), total, "% and _ in the keyword must be escaped, not treated as SQL LIKE wildcards")
	require.Len(t, tickets, 1)

	tickets, total, err = ListTicketsForUser(42, TicketListFilter{Keyword: "bang! literal"}, 0, 20)
	require.NoError(t, err)
	require.Equal(t, int64(1), total, "the LIKE escape character itself must be escaped")
	require.Len(t, tickets, 1)
}

func TestCountTicketsByStatus(t *testing.T) {
	setupTicketDB(t)
	mustCreateTicket(t, 42)
	ticket2, _, err := CreateTicket(42, 42, TicketInitiatedByUser, TicketCategoryGeneral, TicketPriorityNormal, "second", "body", "create-req-second")
	require.NoError(t, err)
	_, _, err = CreateTicket(7, 7, TicketInitiatedByUser, TicketCategoryGeneral, TicketPriorityNormal, "third", "body", "create-req-third")
	require.NoError(t, err)
	_, err = ResolveTicket(ticket2.PublicId, TicketAuthorKindUser, ticket2.Version)
	require.NoError(t, err)

	global, err := CountTicketsByStatus(nil)
	require.NoError(t, err)
	require.Equal(t, int64(2), global[TicketStatusOpen])
	require.Equal(t, int64(1), global[TicketStatusResolved])

	scopedUser := 42
	scoped, err := CountTicketsByStatus(&scopedUser)
	require.NoError(t, err)
	require.Equal(t, int64(1), scoped[TicketStatusOpen])
	require.Equal(t, int64(1), scoped[TicketStatusResolved])
}

func TestValidateTicketAttachmentUrlsBoundsCountAndRejectsBlank(t *testing.T) {
	require.NoError(t, ValidateTicketAttachmentUrls(nil))
	require.NoError(t, ValidateTicketAttachmentUrls([]string{"https://cdn.example.com/a.png"}))
	require.Error(t, ValidateTicketAttachmentUrls([]string{"https://cdn.example.com/a.png", "  "}))

	tooMany := make([]string, TicketAttachmentMaxCount+1)
	for i := range tooMany {
		tooMany[i] = "https://cdn.example.com/f.png"
	}
	require.Error(t, ValidateTicketAttachmentUrls(tooMany))
}

func TestCreateTicketPersistsAttachmentUrls(t *testing.T) {
	setupTicketDB(t)
	withTicketAttachmentStorageBaseForTest(t, "https://cdn.example.com")
	require.NoError(t, recordReadyTicketAttachmentUpload("a.png", 7))
	require.NoError(t, recordReadyTicketAttachmentUpload("b.png", 7))
	_, message, err := CreateTicket(7, 7, TicketInitiatedByUser, TicketCategoryGeneral, TicketPriorityNormal,
		"subject", "body", "create-req-1", "https://cdn.example.com/a.png", "https://cdn.example.com/b.png")
	require.NoError(t, err)
	require.Equal(t, []string{"https://cdn.example.com/a.png", "https://cdn.example.com/b.png"}, message.DecodedAttachmentUrls())

	var reloaded TicketMessage
	require.NoError(t, DB.Where("id = ?", message.Id).First(&reloaded).Error)
	require.Equal(t, []string{"https://cdn.example.com/a.png", "https://cdn.example.com/b.png"}, reloaded.DecodedAttachmentUrls())

	var count int64
	require.NoError(t, DB.Model(&Ticket{}).Count(&count).Error)
	require.Equal(t, int64(1), count)
}

func TestReplyToTicketPersistsAttachmentUrls(t *testing.T) {
	setupTicketDB(t)
	withTicketAttachmentStorageBaseForTest(t, "https://cdn.example.com")
	ticket, _ := mustCreateTicket(t, 7)
	require.NoError(t, recordReadyTicketAttachmentUpload("reply.png", 100))
	_, message, err := ReplyToTicket(ticket.PublicId, 100, TicketAuthorKindStaff, TicketVisibilityPublic,
		"staff reply", "reply-1", "https://cdn.example.com/reply.png")
	require.NoError(t, err)
	require.Equal(t, []string{"https://cdn.example.com/reply.png"}, message.DecodedAttachmentUrls())
}

// TestCreateTicketRejectsAttachmentClaimedByCleanupWorker is the regression
// test for the TOCTOU a second review round flagged:
// controller.validateTicketAttachmentUrlsBelongToCaller's ownership check
// runs before CreateTicket's transaction even starts, so a key that already
// passed that check could still be claimed (and about to be deleted) by the
// cleanup worker before this transaction's message insert actually runs. A
// pre-check alone cannot close that window -- CreateTicket must re-verify
// ownership and claim status itself, inside its own transaction. This test
// claims the row directly (standing in for the cleanup worker winning the
// race) and proves CreateTicket rejects it rather than trusting that an
// earlier, out-of-transaction check already happened.
func TestCreateTicketRejectsAttachmentClaimedByCleanupWorker(t *testing.T) {
	setupTicketDB(t)
	withTicketAttachmentStorageBaseForTest(t, "https://cdn.example.com")
	require.NoError(t, recordReadyTicketAttachmentUpload("permanent/7/racy.png", 7))
	var upload TicketAttachmentUpload
	require.NoError(t, DB.Where("storage_key = ?", "permanent/7/racy.png").First(&upload).Error)

	claimed, err := ClaimTicketAttachmentUploadForCleanup(upload.Id, upload.StorageKey, common.GetTimestamp())
	require.NoError(t, err)
	require.True(t, claimed, "test setup: the cleanup worker must win the claim before CreateTicket runs")

	_, _, err = CreateTicket(7, 7, TicketInitiatedByUser, TicketCategoryGeneral, TicketPriorityNormal,
		"subject", "body", "create-req-1", "https://cdn.example.com/permanent/7/racy.png")
	require.Error(t, err, "a key claimed by the cleanup worker must be rejected even though it could have already passed an earlier, now-stale ownership check")

	var count int64
	require.NoError(t, DB.Model(&Ticket{}).Count(&count).Error)
	require.Zero(t, count, "the whole transaction must roll back, not partially commit a ticket without its attachment")
}

// TestReplyToTicketRejectsAttachmentClaimedByCleanupWorker is
// ReplyToTicket's counterpart to TestCreateTicketRejectsAttachmentClaimedByCleanupWorker.
func TestReplyToTicketRejectsAttachmentClaimedByCleanupWorker(t *testing.T) {
	setupTicketDB(t)
	withTicketAttachmentStorageBaseForTest(t, "https://cdn.example.com")
	ticket, _ := mustCreateTicket(t, 7)
	require.NoError(t, recordReadyTicketAttachmentUpload("permanent/7/racy-reply.png", 100))
	var upload TicketAttachmentUpload
	require.NoError(t, DB.Where("storage_key = ?", "permanent/7/racy-reply.png").First(&upload).Error)

	claimed, err := ClaimTicketAttachmentUploadForCleanup(upload.Id, upload.StorageKey, common.GetTimestamp())
	require.NoError(t, err)
	require.True(t, claimed)

	_, _, err = ReplyToTicket(ticket.PublicId, 100, TicketAuthorKindStaff, TicketVisibilityPublic,
		"staff reply", "reply-1", "https://cdn.example.com/permanent/7/racy-reply.png")
	require.Error(t, err, "a key claimed by the cleanup worker must be rejected")
}

func TestFindTicketMessageByAttachmentURLLocatesExactMatch(t *testing.T) {
	setupTicketDB(t)
	withTicketAttachmentStorageBaseForTest(t, "https://cdn.example.com")
	require.NoError(t, recordReadyTicketAttachmentUpload("a!_%25.png", 7))
	_, message, err := CreateTicket(7, 7, TicketInitiatedByUser, TicketCategoryGeneral, TicketPriorityNormal,
		"subject", "body", "create-req-1", "https://cdn.example.com/a!_%25.png")
	require.NoError(t, err)

	found, err := FindTicketMessageByAttachmentURL("https://cdn.example.com/a!_%25.png")
	require.NoError(t, err)
	require.Equal(t, message.Id, found.Id)

	_, err = FindTicketMessageByAttachmentURL("https://cdn.example.com/a!_%25.png_")
	require.Error(t, err, "a suffix superstring must not match")

	_, err = FindTicketMessageByAttachmentURL("https://cdn.example.com/nope.png")
	require.Error(t, err)
}
