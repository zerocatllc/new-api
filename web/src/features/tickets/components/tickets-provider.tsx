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
import { useQuery, useQueryClient } from '@tanstack/react-query'
import React, { useCallback, useState } from 'react'

import useDialogState from '@/hooks/use-dialog'

import { getTicketCapabilities } from '../api'
import { ticketQueryKeys } from '../lib/ticket-query-keys'
import type { Ticket } from '../types'

export type TicketsDialogType = 'create' | 'view'

type TicketsContextType = {
  open: TicketsDialogType | null
  setOpen: (str: TicketsDialogType | null) => void
  currentRow: Ticket | null
  setCurrentRow: React.Dispatch<React.SetStateAction<Ticket | null>>
  triggerRefresh: () => void
  enabled: boolean
  attachmentsEnabled: boolean
  capabilitiesLoading: boolean
  capabilitiesError: boolean
  capabilitiesRefreshFailed: boolean
  refetchCapabilities: () => void
}

const TicketsContext = React.createContext<TicketsContextType | null>(null)

export function TicketsProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useDialogState<TicketsDialogType>(null)
  const [currentRow, setCurrentRow] = useState<Ticket | null>(null)
  const queryClient = useQueryClient()
  const capabilities = useQuery({
    queryKey: ['ticket-capabilities'],
    queryFn: async () => {
      const result = await getTicketCapabilities()
      if (!result.success || !result.data) {
        throw new Error(result.message || 'Failed to load ticket system status')
      }
      return result.data
    },
    refetchInterval: 30_000,
  })
  const enabled = capabilities.data?.enabled ?? false
  const attachmentsEnabled = capabilities.data?.attachments_enabled ?? false

  const triggerRefresh = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ticketQueryKeys.userLists })
  }, [queryClient])

  return (
    <TicketsContext
      value={{
        open,
        setOpen,
        currentRow,
        setCurrentRow,
        triggerRefresh,
        enabled,
        attachmentsEnabled,
        capabilitiesLoading: capabilities.isLoading,
        capabilitiesError: capabilities.isError && !capabilities.data,
        capabilitiesRefreshFailed: capabilities.isError && !!capabilities.data,
        refetchCapabilities: () => void capabilities.refetch(),
      }}
    >
      {children}
    </TicketsContext>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export const useTickets = () => {
  const ticketsContext = React.useContext(TicketsContext)

  if (!ticketsContext) {
    throw new Error('useTickets has to be used within <TicketsProvider>')
  }

  return ticketsContext
}
