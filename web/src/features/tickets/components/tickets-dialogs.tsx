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

import { getMyTicket } from '../api'
import { clearTicketDeepLink } from '../lib/ticket-deep-link'
import { CreateTicketDrawer } from './create-ticket-drawer'
import { TicketDetailSheet } from './ticket-detail-sheet'
import { useTickets } from './tickets-provider'

const route = getRouteApi('/_authenticated/tickets/')

export function TicketsDialogs() {
  const { ticket: deepLinkedTicket } = route.useSearch()
  const navigate = route.useNavigate()
  const { open, setOpen, currentRow, setCurrentRow } = useTickets()
  const ticketQuery = useQuery({
    queryKey: ['ticket-deep-link', deepLinkedTicket],
    queryFn: () => {
      if (!deepLinkedTicket) {
        throw new Error('Ticket public ID is required')
      }
      return getMyTicket(deepLinkedTicket)
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
      <CreateTicketDrawer
        open={open === 'create'}
        onOpenChange={(isOpen) => !isOpen && setOpen(null)}
      />
      <TicketDetailSheet
        open={open === 'view'}
        onOpenChange={(isOpen) => !isOpen && closeTicket()}
        ticketSummary={currentRow}
      />
    </>
  )
}
