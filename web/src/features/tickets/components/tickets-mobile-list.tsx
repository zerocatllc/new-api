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
import type { Table as TanstackTable } from '@tanstack/react-table'
import { MessageCircleQuestion, Plus } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { StatusBadge } from '@/components/status-badge'
import { Button } from '@/components/ui/button'
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty'
import { Skeleton } from '@/components/ui/skeleton'
import { formatTimestampToDate } from '@/lib/format'

import { TICKET_CATEGORY_LABELS } from '../constants'
import type { Ticket } from '../types'
import { useTickets } from './tickets-provider'

const MOBILE_SKELETON_KEYS = [
  'ticket-mobile-skeleton-1',
  'ticket-mobile-skeleton-2',
  'ticket-mobile-skeleton-3',
]

function TicketsMobileSkeleton() {
  return (
    <div className='divide-border overflow-hidden rounded-lg border'>
      {MOBILE_SKELETON_KEYS.map((key) => (
        <div
          key={key}
          className='space-y-2 border-b px-3 py-2.5 last:border-b-0'
        >
          <div className='flex items-center justify-between'>
            <Skeleton className='h-4 w-32' />
            <Skeleton className='h-5 w-16 rounded-md' />
          </div>
          <Skeleton className='h-3 w-28' />
        </div>
      ))}
    </div>
  )
}

interface TicketsMobileListProps {
  table: TanstackTable<Ticket>
  isLoading: boolean
}

export function TicketsMobileList(props: TicketsMobileListProps) {
  const { t } = useTranslation()
  const { setCurrentRow, setOpen, enabled } = useTickets()
  const rows = props.table.getRowModel().rows

  if (props.isLoading) return <TicketsMobileSkeleton />

  if (!rows.length) {
    return (
      <div className='rounded-lg border p-8'>
        <Empty className='border-none p-0'>
          <EmptyHeader>
            <EmptyMedia variant='icon'>
              <MessageCircleQuestion className='size-6' />
            </EmptyMedia>
            <EmptyTitle>{t('No Support Tickets Yet')}</EmptyTitle>
            <EmptyDescription>
              {t('Open a ticket if you need help from our support team.')}
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button
              size='sm'
              onClick={() => setOpen('create')}
              disabled={!enabled}
            >
              <Plus data-icon='inline-start' />
              <span>{t('New Ticket')}</span>
            </Button>
          </EmptyContent>
        </Empty>
      </div>
    )
  }

  return (
    <div className='divide-border overflow-hidden rounded-lg border'>
      {rows.map((row) => {
        const ticket = row.original
        let statusLabel = t('Replied')
        let statusVariant: 'success' | 'warning' | 'info' = 'info'
        if (ticket.status === 'resolved') {
          statusLabel = t('Resolved')
          statusVariant = 'success'
        } else if (ticket.waiting_on === 'staff') {
          statusLabel = t('Waiting on support')
          statusVariant = 'warning'
        }
        return (
          <button
            key={row.id}
            type='button'
            onClick={() => {
              setCurrentRow(ticket)
              setOpen('view')
            }}
            className='bg-card hover:bg-muted/50 w-full space-y-1.5 border-b px-3 py-2.5 text-left last:border-b-0'
          >
            <div className='flex items-start justify-between gap-3'>
              <div className='min-w-0 truncate text-sm font-semibold'>
                {ticket.subject}
              </div>
              <StatusBadge
                label={statusLabel}
                variant={statusVariant}
                copyable={false}
              />
            </div>
            <div className='text-muted-foreground flex items-center justify-between text-xs'>
              <span>{t(TICKET_CATEGORY_LABELS[ticket.category])}</span>
              <span className='font-mono'>
                {formatTimestampToDate(ticket.updated_at)}
              </span>
            </div>
          </button>
        )
      })}
    </div>
  )
}
