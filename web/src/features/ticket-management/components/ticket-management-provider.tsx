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
import { useQueryClient } from '@tanstack/react-query'
import React, { useCallback, useState } from 'react'

import { ticketQueryKeys } from '@/features/tickets/lib/ticket-query-keys'
import useDialogState from '@/hooks/use-dialog'

import type { AdminTicket } from '../types'

export type TicketManagementDialogType =
  | 'view'
  | 'create'
  | 'settings'
  | 'trash'

type TicketManagementContextType = {
  open: TicketManagementDialogType | null
  setOpen: (str: TicketManagementDialogType | null) => void
  currentRow: AdminTicket | null
  setCurrentRow: React.Dispatch<React.SetStateAction<AdminTicket | null>>
  triggerRefresh: (options?: { stats?: boolean }) => void
}

const TicketManagementContext =
  React.createContext<TicketManagementContextType | null>(null)

export function TicketManagementProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const [open, setOpen] = useDialogState<TicketManagementDialogType>(null)
  const [currentRow, setCurrentRow] = useState<AdminTicket | null>(null)
  const queryClient = useQueryClient()

  const triggerRefresh = useCallback(
    (options?: { stats?: boolean }) => {
      void queryClient.invalidateQueries({
        queryKey: ticketQueryKeys.adminLists,
      })
      if (options?.stats) {
        void queryClient.invalidateQueries({
          queryKey: ticketQueryKeys.adminStats,
        })
      }
    },
    [queryClient]
  )

  return (
    <TicketManagementContext
      value={{
        open,
        setOpen,
        currentRow,
        setCurrentRow,
        triggerRefresh,
      }}
    >
      {children}
    </TicketManagementContext>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export const useTicketManagement = () => {
  const context = React.useContext(TicketManagementContext)

  if (!context) {
    throw new Error(
      'useTicketManagement has to be used within <TicketManagementProvider>'
    )
  }

  return context
}
