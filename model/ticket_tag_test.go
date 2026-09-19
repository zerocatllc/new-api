package model

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestAddTicketTagsDedupesAndTrims(t *testing.T) {
	setupTicketDB(t)
	ticket, _ := mustCreateTicket(t, 7)

	cases := []struct {
		name     string
		input    []string
		expected []string
	}{
		{"trims and lowercases", []string{" Bug ", "URGENT"}, []string{"bug", "urgent"}},
		{"dedupes case-insensitively within one call", []string{"Bug", "bug", " BUG "}, []string{"bug"}},
		{"dedupes against an already-stored tag", []string{"bug", "billing"}, []string{"bug", "billing"}},
	}

	var accumulated []string
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			require.NoError(t, AddTicketTags(ticket.Id, tc.input))
			for _, tag := range tc.expected {
				found := false
				for _, existing := range accumulated {
					if existing == tag {
						found = true
					}
				}
				if !found {
					accumulated = append(accumulated, tag)
				}
			}
			tags, err := ListTicketTags(ticket.Id)
			require.NoError(t, err)
			assert.ElementsMatch(t, accumulated, tags)
		})
	}
}

func TestAddTicketTagsRejectsBlankAndOversizedTag(t *testing.T) {
	setupTicketDB(t)
	ticket, _ := mustCreateTicket(t, 7)

	err := AddTicketTags(ticket.Id, []string{"   "})
	assert.Error(t, err, "an all-whitespace tag list must be rejected, not silently stored as empty")

	oversized := make([]byte, TicketTagMaxLength+1)
	for i := range oversized {
		oversized[i] = 'a'
	}
	err = AddTicketTags(ticket.Id, []string{string(oversized)})
	assert.Error(t, err)
}

func TestRemoveTicketTagIsNoOpWhenAbsent(t *testing.T) {
	setupTicketDB(t)
	ticket, _ := mustCreateTicket(t, 7)

	require.NoError(t, RemoveTicketTag(ticket.Id, "never-added"))

	require.NoError(t, AddTicketTags(ticket.Id, []string{"bug"}))
	require.NoError(t, RemoveTicketTag(ticket.Id, "BUG"))

	tags, err := ListTicketTags(ticket.Id)
	require.NoError(t, err)
	assert.Empty(t, tags)
}

func TestListTicketIDsByTagsIntersectsCorrectly(t *testing.T) {
	setupTicketDB(t)
	bugTicket, _ := mustCreateTicket(t, 7)
	billingTicket, _ := mustCreateTicket(t, 7)
	untaggedTicket, _ := mustCreateTicket(t, 7)

	require.NoError(t, AddTicketTags(bugTicket.Id, []string{"bug"}))
	require.NoError(t, AddTicketTags(billingTicket.Id, []string{"billing"}))
	_ = untaggedTicket

	ids, err := ListTicketIDsByTags([]string{"bug", "billing"})
	require.NoError(t, err)
	assert.ElementsMatch(t, []int64{bugTicket.Id, billingTicket.Id}, ids)

	ids, err = ListTicketIDsByTags([]string{"bug"})
	require.NoError(t, err)
	assert.ElementsMatch(t, []int64{bugTicket.Id}, ids)

	ids, err = ListTicketIDsByTags([]string{"nonexistent"})
	require.NoError(t, err)
	assert.Empty(t, ids)

	ids, err = ListTicketIDsByTags(nil)
	require.NoError(t, err)
	assert.Empty(t, ids)
}

func TestListTicketTagsByTicketIDsGroupsOneBatch(t *testing.T) {
	setupTicketDB(t)
	first, _ := mustCreateTicket(t, 7)
	second, _ := mustCreateTicket(t, 7)
	require.NoError(t, AddTicketTags(first.Id, []string{"bug", "urgent"}))
	require.NoError(t, AddTicketTags(second.Id, []string{"billing"}))

	grouped, err := ListTicketTagsByTicketIDs([]int64{first.Id, second.Id})
	require.NoError(t, err)
	assert.Equal(t, []string{"bug", "urgent"}, grouped[first.Id])
	assert.Equal(t, []string{"billing"}, grouped[second.Id])
}

func TestApplyTicketListFilterTagsBranch(t *testing.T) {
	setupTicketDB(t)
	bugTicket, _ := mustCreateTicket(t, 7)
	_, _ = mustCreateTicket(t, 7)
	require.NoError(t, AddTicketTags(bugTicket.Id, []string{"bug"}))

	tickets, total, err := ListTicketsForAdmin(TicketListFilter{Tags: []string{"bug"}}, 0, 10)
	require.NoError(t, err)
	assert.EqualValues(t, 1, total)
	require.Len(t, tickets, 1)
	assert.Equal(t, bugTicket.Id, tickets[0].Id)
}
