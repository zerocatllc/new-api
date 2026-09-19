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
import type { ColumnDef } from '@tanstack/react-table'
import { useTranslation } from 'react-i18next'

import { StatusBadge, type StatusVariant } from '@/components/status-badge'
import { Badge } from '@/components/ui/badge'
import { formatTimestampToDate } from '@/lib/format'

import { TICKET_CATEGORY_LABELS, TICKET_PRIORITY_LABELS } from '../constants'
import type { Ticket } from '../types'
import { useTickets } from './tickets-provider'

function ticketStatusBadge(
  ticket: Ticket,
  t: (key: string) => string
): { label: string; variant: StatusVariant } {
  if (ticket.status === 'resolved') {
    return { label: t('Resolved'), variant: 'success' }
  }
  if (ticket.waiting_on === 'staff') {
    return { label: t('Waiting on support'), variant: 'warning' }
  }
  return { label: t('Replied'), variant: 'info' }
}

const PRIORITY_VARIANTS: Record<Ticket['priority'], StatusVariant> = {
  low: 'neutral',
  normal: 'neutral',
  high: 'warning',
  critical: 'danger',
}

export function useTicketsColumns(): ColumnDef<Ticket>[] {
  const { t } = useTranslation()
  const { setCurrentRow, setOpen } = useTickets()
  return [
    {
      accessorKey: 'subject',
      header: t('Subject'),
      meta: { mobileTitle: true },
      cell: ({ row }) => (
        <button
          type='button'
          className='text-left font-medium hover:underline'
          onClick={() => {
            setCurrentRow(row.original)
            setOpen('view')
          }}
        >
          <span>{row.getValue('subject')}</span>
          {!!row.original.unread_count && (
            <Badge className='ml-2 px-1.5 py-0 text-[10px]'>
              {row.original.unread_count}
            </Badge>
          )}
        </button>
      ),
      size: 260,
    },
    {
      id: 'status',
      header: t('Status'),
      meta: { mobileBadge: true },
      cell: ({ row }) => {
        const badge = ticketStatusBadge(row.original, t)
        return (
          <StatusBadge
            label={badge.label}
            variant={badge.variant}
            copyable={false}
            className='-ml-1.5'
          />
        )
      },
      size: 160,
    },
    {
      accessorKey: 'priority',
      header: t('Priority'),
      meta: { mobileHidden: true },
      cell: ({ row }) => {
        const priority = row.getValue('priority') as Ticket['priority']
        return (
          <StatusBadge
            label={t(TICKET_PRIORITY_LABELS[priority])}
            variant={PRIORITY_VARIANTS[priority]}
            copyable={false}
            className='-ml-1.5'
          />
        )
      },
      size: 120,
    },
    {
      accessorKey: 'category',
      header: t('Category'),
      meta: { mobileHidden: true },
      cell: ({ row }) => {
        const category = row.getValue('category') as Ticket['category']
        return (
          <span className='text-muted-foreground text-sm'>
            {t(TICKET_CATEGORY_LABELS[category])}
          </span>
        )
      },
      size: 140,
    },
    {
      accessorKey: 'updated_at',
      header: t('Last Activity'),
      meta: { mobileHidden: true },
      cell: ({ row }) => (
        <div className='min-w-[160px] font-mono text-sm'>
          {formatTimestampToDate(row.getValue('updated_at'))}
        </div>
      ),
      size: 180,
    },
  ]
}
