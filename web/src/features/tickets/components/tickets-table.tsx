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
import { MessageCircleQuestion, Plus } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { DataTablePage, useDataTable } from '@/components/data-table'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useMediaQuery } from '@/hooks'
import { useTableUrlState } from '@/hooks/use-table-url-state'

import { listMyTickets } from '../api'
import {
  TICKET_CATEGORIES,
  TICKET_CATEGORY_LABELS,
  TICKET_PRIORITIES,
  TICKET_PRIORITY_LABELS,
} from '../constants'
import { ticketQueryKeys } from '../lib/ticket-query-keys'
import { useTicketsColumns } from './tickets-columns'
import { TicketsMobileList } from './tickets-mobile-list'
import { useTickets } from './tickets-provider'

const route = getRouteApi('/_authenticated/tickets/')

const STATUS_TABS = [
  { value: 'all', status: '' },
  { value: 'open', status: 'open' },
  { value: 'resolved', status: 'resolved' },
] as const

export function TicketsTable() {
  const { t } = useTranslation()
  const columns = useTicketsColumns()
  const { setOpen, enabled } = useTickets()
  const isMobile = useMediaQuery('(max-width: 640px)')

  const {
    globalFilter,
    onGlobalFilterChange,
    columnFilters,
    onColumnFiltersChange,
    pagination,
    onPaginationChange,
    ensurePageInRange,
  } = useTableUrlState({
    search: route.useSearch(),
    navigate: route.useNavigate(),
    pagination: { defaultPage: 1, defaultPageSize: isMobile ? 10 : 20 },
    globalFilter: { enabled: true, key: 'filter' },
    columnFilters: [
      { columnId: 'status', searchKey: 'status', type: 'array' },
      { columnId: 'category', searchKey: 'category', type: 'array' },
      { columnId: 'priority', searchKey: 'priority', type: 'array' },
    ],
  })

  const status =
    ((columnFilters.find((item) => item.id === 'status')?.value as string[]) ??
      [])[0] ?? ''
  const statusTab =
    STATUS_TABS.find((tab) => tab.status === status)?.value ?? 'all'
  const handleStatusTabChange = (value: string) => {
    const nextStatus = STATUS_TABS.find((tab) => tab.value === value)?.status
    onColumnFiltersChange((old) => [
      ...old.filter((f) => f.id !== 'status'),
      ...(nextStatus ? [{ id: 'status', value: [nextStatus] }] : []),
    ])
  }
  const category =
    ((columnFilters.find((item) => item.id === 'category')?.value as
      | string[]
      | undefined) ?? [])[0] ?? ''
  const priority =
    ((columnFilters.find((item) => item.id === 'priority')?.value as
      | string[]
      | undefined) ?? [])[0] ?? ''

  const { data, isLoading, isFetching, isError, error, refetch } = useQuery({
    queryKey: [
      ...ticketQueryKeys.userLists,
      pagination.pageIndex + 1,
      pagination.pageSize,
      globalFilter,
      status,
      category,
      priority,
    ],
    queryFn: async () => {
      const result = await listMyTickets(
        pagination.pageIndex + 1,
        pagination.pageSize,
        {
          keyword: globalFilter || undefined,
          status: status || undefined,
          category: category || undefined,
          priority: priority || undefined,
        }
      )
      if (!result.success) {
        throw new Error(result.message || 'Failed to load tickets')
      }
      return {
        items: result.data?.items || [],
        total: result.data?.total || 0,
      }
    },
    placeholderData: (previousData) => previousData,
  })

  const tickets = data?.items || []

  const { table } = useDataTable({
    data: tickets,
    columns,
    globalFilter,
    columnFilters,
    pagination,
    onGlobalFilterChange,
    onColumnFiltersChange,
    onPaginationChange,
    manualPagination: true,
    manualFiltering: true,
    totalCount: data?.total || 0,
    ensurePageInRange,
  })

  if (isError && !data) {
    return (
      <Alert variant='destructive'>
        <AlertTitle>{t('Failed to load tickets')}</AlertTitle>
        <AlertDescription className='flex flex-col items-start gap-3'>
          <span>
            {error instanceof Error ? error.message : t('Unknown error')}
          </span>
          <Button
            type='button'
            size='sm'
            variant='outline'
            onClick={() => void refetch()}
          >
            {t('Retry')}
          </Button>
        </AlertDescription>
      </Alert>
    )
  }

  return (
    <div className='flex h-full min-h-0 flex-col gap-2.5 sm:gap-3'>
      <Tabs value={statusTab} onValueChange={handleStatusTabChange}>
        <TabsList variant='default'>
          <TabsTrigger value='all'>{t('All')}</TabsTrigger>
          <TabsTrigger value='open'>{t('Open')}</TabsTrigger>
          <TabsTrigger value='resolved'>{t('Resolved')}</TabsTrigger>
        </TabsList>
      </Tabs>

      {isError && (
        <Alert variant='destructive'>
          <AlertTitle>
            {t('Refresh failed. Showing previously loaded data.')}
          </AlertTitle>
          <AlertDescription className='flex flex-col items-start gap-2'>
            <Button
              type='button'
              size='sm'
              variant='outline'
              onClick={() => void refetch()}
            >
              {t('Retry')}
            </Button>
          </AlertDescription>
        </Alert>
      )}

      <div className='min-h-0 flex-1'>
        <DataTablePage
          table={table}
          columns={columns}
          isLoading={isLoading}
          isFetching={isFetching}
          emptyIcon={<MessageCircleQuestion className='size-6' />}
          emptyTitle={t('No Support Tickets Yet')}
          emptyDescription={t(
            'Open a ticket if you need help from our support team.'
          )}
          emptyAction={
            <Button
              size='sm'
              onClick={() => setOpen('create')}
              disabled={!enabled}
            >
              <Plus data-icon='inline-start' />
              <span>{t('New Ticket')}</span>
            </Button>
          }
          skeletonKeyPrefix='tickets-skeleton'
          applyHeaderSize
          toolbarProps={{
            searchPlaceholder: t('Filter by subject...'),
            filters: [
              {
                columnId: 'category',
                title: t('Category'),
                singleSelect: true,
                options: TICKET_CATEGORIES.map((value) => ({
                  value,
                  label: t(TICKET_CATEGORY_LABELS[value]),
                })),
              },
              {
                columnId: 'priority',
                title: t('Priority'),
                singleSelect: true,
                options: TICKET_PRIORITIES.map((value) => ({
                  value,
                  label: t(TICKET_PRIORITY_LABELS[value]),
                })),
              },
            ],
          }}
          mobile={<TicketsMobileList table={table} isLoading={isLoading} />}
        />
      </div>
    </div>
  )
}
