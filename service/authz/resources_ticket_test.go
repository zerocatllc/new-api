package authz

import (
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestTicketPermissionsDefaultToAdminExceptSettingsWrite(t *testing.T) {
	db := newAuthzTestDB(t)
	require.NoError(t, Init(db))

	assert.True(t, Can(2, common.RoleAdminUser, TicketRead))
	assert.True(t, Can(2, common.RoleAdminUser, TicketReply))
	assert.True(t, Can(2, common.RoleAdminUser, TicketManage))
	assert.False(t, Can(2, common.RoleAdminUser, TicketSettingsWrite), "an ordinary admin must not get settings_write by default")
	assert.False(t, Can(2, common.RoleAdminUser, TicketViewUserProfile), "an ordinary admin must not get view_user_profile by default")
	assert.False(t, Can(2, common.RoleAdminUser, TicketDelete), "an ordinary admin must not get delete by default")

	assert.False(t, Can(3, common.RoleCommonUser, TicketRead))
}

func TestTicketSettingsWriteIsRootOnlyViaSuperuserBypass(t *testing.T) {
	db := newAuthzTestDB(t)
	require.NoError(t, Init(db))

	assert.True(t, Can(1, common.RoleRootUser, TicketSettingsWrite))
	assert.True(t, Can(1, common.RoleRootUser, TicketDelete))
}
