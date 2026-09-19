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
import { Checkbox } from '@/components/ui/checkbox'
import { formatTimestampToDate } from '@/lib/format'

import { TICKET_CATEGORY_LABELS, TICKET_PRIORITY_LABELS } from '../constants'
import type { AdminTicket } from '../types'
import { useTicketManagement } from './ticket-management-provider'

const PRIORITY_VARIANTS: Record<AdminTicket['priority'], StatusVariant> = {
  low: 'neutral',
  normal: 'neutral',
  high: 'warning',
  critical: 'danger',
}

export function useTicketsAdminColumns(
  canManage: boolean
): ColumnDef<AdminTicket>[] {
  const { t } = useTranslation()
  const { setCurrentRow, setOpen } = useTicketManagement()

  const columns: ColumnDef<AdminTicket>[] = [
    {
      id: 'select',
      header: ({ table }) => (
        <Checkbox
          checked={table.getIsAllPageRowsSelected()}
          indeterminate={table.getIsSomePageRowsSelected()}
          onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
          aria-label={t('Select all')}
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={(value) => row.toggleSelected(!!value)}
          aria-label={t('Select row')}
        />
      ),
      enableSorting: false,
      enableHiding: false,
      enableResizing: false,
      size: 40,
    },
    {
      accessorKey: 'subject',
      header: t('Subject'),
      meta: { mobileTitle: true },
      cell: ({ row }) => {
        const unreadCount = row.original.unread_count ?? 0
        return (
          <button
            type='button'
            className='flex items-center gap-1.5 text-left font-medium hover:underline'
            onClick={() => {
              setCurrentRow(row.original)
              setOpen('view')
            }}
          >
            <span>{row.getValue('subject')}</span>
            {unreadCount > 0 && (
              <span className='bg-primary text-primary-foreground inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold tabular-nums'>
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </button>
        )
      },
      size: 240,
    },
    {
      accessorKey: 'user_id',
      header: t('Requester'),
      meta: { mobileHidden: true },
      cell: ({ row }) => {
        const name = row.original.display_name || row.original.username
        return (
          <div className='flex flex-col'>
            {name && <span className='text-sm'>{name}</span>}
            <span className='text-muted-foreground text-xs'>
              {t('User ID')}: {row.getValue('user_id')}
            </span>
          </div>
        )
      },
      size: 140,
    },
    {
      accessorKey: 'status',
      header: t('Status'),
      meta: { mobileBadge: true },
      cell: ({ row }) => {
        const ticket = row.original
        let statusLabel = t('Waiting on user')
        let statusVariant: StatusVariant = 'info'
        if (ticket.status === 'resolved') {
          statusLabel = t('Resolved')
          statusVariant = 'success'
        } else if (ticket.waiting_on === 'staff') {
          statusLabel = t('Waiting on support')
          statusVariant = 'warning'
        }
        return (
          <StatusBadge
            label={statusLabel}
            variant={statusVariant}
            copyable={false}
            className='-ml-1.5'
          />
        )
      },
      filterFn: (row, _id, value: string[]) =>
        value.includes(row.original.status),
      size: 160,
    },
    {
      accessorKey: 'priority',
      header: t('Priority'),
      meta: { mobileHidden: true },
      cell: ({ row }) => {
        const priority = row.getValue('priority') as AdminTicket['priority']
        return (
          <StatusBadge
            label={t(TICKET_PRIORITY_LABELS[priority])}
            variant={PRIORITY_VARIANTS[priority]}
            copyable={false}
            className='-ml-1.5'
          />
        )
      },
      filterFn: (row, _id, value: string[]) =>
        value.includes(row.original.priority),
      size: 120,
    },
    {
      accessorKey: 'category',
      header: t('Category'),
      meta: { mobileHidden: true },
      cell: ({ row }) => {
        const category = row.getValue('category') as AdminTicket['category']
        return (
          <span className='text-muted-foreground text-sm'>
            {t(TICKET_CATEGORY_LABELS[category])}
          </span>
        )
      },
      filterFn: (row, _id, value: string[]) =>
        value.includes(row.original.category),
      size: 140,
    },
    {
      accessorKey: 'assigned_to',
      header: t('Assigned To'),
      meta: { mobileHidden: true },
      cell: ({ row }) => {
        const assignedTo = row.getValue('assigned_to') as number | null
        return assignedTo ? (
          <span className='text-sm'>{assignedTo}</span>
        ) : (
          <span className='text-muted-foreground text-sm'>
            {t('Unassigned')}
          </span>
        )
      },
      size: 120,
    },
    {
      accessorKey: 'tags',
      header: t('Tags'),
      meta: { mobileHidden: true },
      cell: ({ row }) => {
        const tags = row.original.tags ?? []
        if (tags.length === 0) {
          return <span className='text-muted-foreground text-sm'>—</span>
        }
        return (
          <div className='flex max-w-56 flex-wrap gap-1'>
            {tags.map((tag) => (
              <Badge key={tag} variant='secondary' className='font-normal'>
                {tag}
              </Badge>
            ))}
          </div>
        )
      },
      filterFn: (row, _id, value: string[]) =>
        value.some((tag) => row.original.tags?.includes(tag)),
      size: 180,
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
  return canManage
    ? columns
    : columns.filter((column) => column.id !== 'select')
}
