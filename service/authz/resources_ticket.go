package authz

const (
	ResourceTicket = "ticket"

	ActionReply           = "reply"
	ActionManage          = "manage"
	ActionSettingsWrite   = "settings_write"
	ActionViewUserProfile = "view_user_profile"
	ActionDelete          = "delete"
)

var (
	TicketRead            = Permission{Resource: ResourceTicket, Action: ActionRead}
	TicketReply           = Permission{Resource: ResourceTicket, Action: ActionReply}
	TicketManage          = Permission{Resource: ResourceTicket, Action: ActionManage}
	TicketSettingsWrite   = Permission{Resource: ResourceTicket, Action: ActionSettingsWrite}
	TicketViewUserProfile = Permission{Resource: ResourceTicket, Action: ActionViewUserProfile}
	TicketDelete          = Permission{Resource: ResourceTicket, Action: ActionDelete}
)

func init() {
	RegisterResource(ResourceDefinition{
		Resource: ResourceTicket,
		LabelKey: "Ticket Support",
		Actions: []ActionDefinition{
			{
				Action:         ActionRead,
				LabelKey:       "Read tickets",
				DescriptionKey: "View every ticket, its messages, and internal notes.",
				DefaultRoles:   []string{BuiltInRoleAdmin},
			},
			{
				Action:         ActionReply,
				LabelKey:       "Reply to tickets",
				DescriptionKey: "Post public replies and internal notes on any ticket.",
				DefaultRoles:   []string{BuiltInRoleAdmin},
			},
			{
				Action:         ActionManage,
				LabelKey:       "Manage tickets",
				DescriptionKey: "Resolve, reopen, and assign tickets.",
				DefaultRoles:   []string{BuiltInRoleAdmin},
			},
			{
				Action:         ActionDelete,
				LabelKey:       "Delete tickets",
				DescriptionKey: "Move tickets to the recoverable trash and restore them.",
				// No DefaultRoles: root receives this through the superuser bypass.
			},
			{
				Action:         ActionSettingsWrite,
				LabelKey:       "Edit ticket settings",
				DescriptionKey: "Change whether the ticket system is enabled.",
				// No DefaultRoles: root has this via the superuser bypass in
				// authz.Can; an ordinary admin must be granted it explicitly.
			},
			{
				Action:         ActionViewUserProfile,
				LabelKey:       "View requester account info",
				DescriptionKey: "See the ticket requester's quota, group, role, and account status.",
				// No DefaultRoles: this exposes account/billing details beyond
				// the ticket itself, so it must be granted explicitly like
				// ActionSettingsWrite rather than bundled into ActionRead.
			},
		},
	})
}
