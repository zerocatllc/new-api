/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
// Backend-fork extensions grafted into the shared (upstream/zero.cat) sidebar
// hooks. Keeping the bodies here lets the shared files differ from upstream by
// only a stable import + one splice per location, so re-imports merge in one pass.
import { useQuery } from '@tanstack/react-query'
import type { TFunction } from 'i18next'
import { MessageCircleQuestion } from 'lucide-react'

import type { NavItem } from '@/components/layout/types'
import { getTicketUnreadCountAdmin } from '@/features/ticket-management/api'
import { getMyTicketUnreadCount } from '@/features/tickets/api'
import { ticketQueryKeys } from '@/features/tickets/lib/ticket-query-keys'
import { hasPermission } from '@/lib/admin-permissions'
import { useAuthStore } from '@/stores/auth-store'

export type TicketBadges = {
  myTicketBadge: number | undefined
  adminTicketBadge: number | undefined
  canReadTickets: boolean
}

/** Ticket unread-badge counts + admin ticket permission for the sidebar. */
export function useTicketBadges(): TicketBadges {
  const currentUser = useAuthStore((state) => state.auth.user)
  const myUnread = useQuery({
    queryKey: ticketQueryKeys.userUnread,
    queryFn: getMyTicketUnreadCount,
    enabled: Boolean(currentUser),
    refetchInterval: 30_000,
  })
  const canReadTickets = hasPermission(currentUser, 'ticket', 'read')
  const adminUnread = useQuery({
    queryKey: ticketQueryKeys.adminUnread,
    queryFn: getTicketUnreadCountAdmin,
    enabled: canReadTickets,
    refetchInterval: 30_000,
  })
  return {
    myTicketBadge: myUnread.data?.data?.unread_ticket_count,
    adminTicketBadge: adminUnread.data?.data?.unread_ticket_count,
    canReadTickets,
  }
}

/** User panel: Support Tickets entry (Account & Security group). */
export function extSupportTicketsItems(
  t: TFunction,
  myTicketBadge: number | undefined
): NavItem[] {
  return [
    {
      title: t('Support Tickets'),
      url: '/tickets',
      icon: MessageCircleQuestion,
      badge: myTicketBadge ? String(myTicketBadge) : undefined,
    },
  ]
}

/** Admin panel: Ticket Management entry (Members group), gated on permission. */
export function extTicketManagementItems(
  t: TFunction,
  canReadTickets: boolean,
  adminTicketBadge: number | undefined
): NavItem[] {
  if (!canReadTickets) return []
  return [
    {
      title: t('Ticket Management'),
      url: '/ticket-management',
      icon: MessageCircleQuestion,
      badge: adminTicketBadge ? String(adminTicketBadge) : undefined,
    },
  ]
}

// Panel-ownership prefixes (use-sidebar-panel.ts) added by the fork.
export const EXT_ADMIN_PREFIXES = ['/ticket-management']
export const EXT_USER_PREFIXES = ['/tickets']
