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
import { useQuery } from '@tanstack/react-query'
import { getRouteApi } from '@tanstack/react-router'
import { useEffect } from 'react'

import { clearTicketDeepLink } from '@/features/tickets/lib/ticket-deep-link'
import { useAuthStore } from '@/stores/auth-store'

import { getTicketAdmin } from '../api'
import { getTicketPermissions } from '../ticket-permissions'
import { AdminCreateTicketDialog } from './admin-create-ticket-dialog'
import { TicketAdminDetailSheet } from './ticket-admin-detail-sheet'
import { useTicketManagement } from './ticket-management-provider'
import { TicketSettingsDialog } from './ticket-settings-dialog'
import { TicketTrashDialog } from './ticket-trash-dialog'

const route = getRouteApi('/_authenticated/ticket-management/')

export function TicketManagementDialogs() {
  const { ticket: deepLinkedTicket } = route.useSearch()
  const navigate = route.useNavigate()
  const { open, setOpen, currentRow, setCurrentRow } = useTicketManagement()
  const currentUser = useAuthStore((state) => state.auth.user)
  const permissions = getTicketPermissions(currentUser)
  const ticketQuery = useQuery({
    queryKey: ['admin-ticket-deep-link', deepLinkedTicket],
    queryFn: () => {
      if (!deepLinkedTicket) {
        throw new Error('Ticket public ID is required')
      }
      return getTicketAdmin(deepLinkedTicket)
    },
    enabled: Boolean(deepLinkedTicket),
  })

  useEffect(() => {
    if (
      !deepLinkedTicket ||
      !ticketQuery.data?.success ||
      !ticketQuery.data.data
    ) {
      return
    }
    setCurrentRow(ticketQuery.data.data)
    setOpen('view')
  }, [deepLinkedTicket, setCurrentRow, setOpen, ticketQuery.data])

  const closeTicket = () => {
    setOpen(null)
    setCurrentRow(null)
    if (deepLinkedTicket) {
      void navigate({
        replace: true,
        search: clearTicketDeepLink,
      })
    }
  }

  return (
    <>
      {permissions.canManage && (
        <AdminCreateTicketDialog
          open={open === 'create'}
          onOpenChange={(isOpen) => !isOpen && setOpen(null)}
        />
      )}
      {permissions.canRead && (
        <TicketAdminDetailSheet
          open={open === 'view'}
          onOpenChange={(isOpen) => !isOpen && closeTicket()}
          ticketSummary={currentRow}
        />
      )}
      {permissions.canWriteSettings && (
        <TicketSettingsDialog
          open={open === 'settings'}
          onOpenChange={(isOpen) => !isOpen && setOpen(null)}
        />
      )}
      {permissions.canDelete && (
        <TicketTrashDialog
          open={open === 'trash'}
          onOpenChange={(isOpen) => !isOpen && setOpen(null)}
        />
      )}
    </>
  )
}
