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
import { X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { DataTablePage, useDataTable } from '@/components/data-table'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ticketQueryKeys } from '@/features/tickets/lib/ticket-query-keys'
import { useTableUrlState } from '@/hooks/use-table-url-state'
import { useAuthStore } from '@/stores/auth-store'

import { listAllTickets } from '../api'
import {
  TICKET_CATEGORIES,
  TICKET_CATEGORY_LABELS,
  TICKET_PRIORITIES,
  TICKET_PRIORITY_LABELS,
  TICKET_STATUSES,
  TICKET_STATUS_LABELS,
} from '../constants'
import { getTicketPermissions } from '../ticket-permissions'
import { TicketBulkActions } from './ticket-bulk-actions'
import { TicketStatsCards } from './ticket-stats-cards'
import { useTicketsAdminColumns } from './tickets-admin-columns'

const route = getRouteApi('/_authenticated/ticket-management/')

export function TicketsAdminTable() {
  const { t } = useTranslation()
  const currentUser = useAuthStore((state) => state.auth.user)
  const permissions = getTicketPermissions(currentUser)
  const columns = useTicketsAdminColumns(permissions.canManage)

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
    pagination: { defaultPage: 1, defaultPageSize: 20 },
    globalFilter: { enabled: true, key: 'filter' },
    columnFilters: [
      { columnId: 'status', searchKey: 'status', type: 'array' },
      { columnId: 'category', searchKey: 'category', type: 'array' },
      { columnId: 'priority', searchKey: 'priority', type: 'array' },
      { columnId: 'tags', searchKey: 'tags', type: 'array' },
    ],
  })

  const statusFilter =
    ((columnFilters.find((f) => f.id === 'status')?.value as string[]) ??
      [])[0] ?? ''
  const categoryFilter =
    ((columnFilters.find((f) => f.id === 'category')?.value as string[]) ??
      [])[0] ?? ''
  const priorityFilter =
    ((columnFilters.find((f) => f.id === 'priority')?.value as string[]) ??
      [])[0] ?? ''
  const tagFilter =
    (columnFilters.find((filter) => filter.id === 'tags')?.value as
      | string[]
      | undefined) ?? []
  const serializedTagFilter = tagFilter.join(',')
  const [tagDraft, setTagDraft] = useState(tagFilter.join(', '))

  useEffect(() => {
    setTagDraft(serializedTagFilter.replaceAll(',', ', '))
  }, [serializedTagFilter])

  const { data, isLoading, isFetching, isError, error, refetch } = useQuery({
    queryKey: [
      ...ticketQueryKeys.adminLists,
      pagination.pageIndex + 1,
      pagination.pageSize,
      statusFilter,
      categoryFilter,
      priorityFilter,
      tagFilter,
      globalFilter,
    ],
    queryFn: async () => {
      const result = await listAllTickets({
        p: pagination.pageIndex + 1,
        page_size: pagination.pageSize,
        status: statusFilter || undefined,
        category: categoryFilter || undefined,
        priority: priorityFilter || undefined,
        keyword: globalFilter || undefined,
        tags: tagFilter.length ? tagFilter : undefined,
      })
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
    columnFilters,
    globalFilter,
    pagination,
    onPaginationChange,
    onGlobalFilterChange,
    onColumnFiltersChange,
    manualPagination: true,
    manualFiltering: true,
    totalCount: data?.total || 0,
    ensurePageInRange,
    enableRowSelection: permissions.canManage,
    getRowId: (row) => row.public_id,
  })

  const statusOptions = useMemo(
    () =>
      TICKET_STATUSES.map((value) => ({
        label: t(TICKET_STATUS_LABELS[value]),
        value,
      })),
    [t]
  )
  const categoryOptions = useMemo(
    () =>
      TICKET_CATEGORIES.map((value) => ({
        label: t(TICKET_CATEGORY_LABELS[value]),
        value,
      })),
    [t]
  )
  const priorityOptions = useMemo(
    () =>
      TICKET_PRIORITIES.map((value) => ({
        label: t(TICKET_PRIORITY_LABELS[value]),
        value,
      })),
    [t]
  )

  const commitTagFilter = (value: string) => {
    const tags = [
      ...new Set(
        value
          .split(',')
          .map((tag) => tag.trim().toLowerCase())
          .filter(Boolean)
      ),
    ]
    if (tags.length === 0) {
      onColumnFiltersChange(
        columnFilters.filter((filter) => filter.id !== 'tags')
      )
      return
    }
    onColumnFiltersChange((filters) => {
      const withoutTags = filters.filter((filter) => filter.id !== 'tags')
      return [...withoutTags, { id: 'tags', value: tags }]
    })
  }

  if (isError && !data) {
    return (
      <>
        <TicketStatsCards />
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
      </>
    )
  }

  return (
    <>
      <TicketStatsCards />
      {isError && (
        <Alert variant='destructive' className='mb-3'>
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
      <DataTablePage
        table={table}
        columns={columns}
        isLoading={isLoading}
        isFetching={isFetching}
        emptyTitle={t('No Tickets Found')}
        emptyDescription={t('No tickets match the current filters.')}
        skeletonKeyPrefix='admin-tickets-skeleton'
        applyHeaderSize
        toolbarProps={{
          searchPlaceholder: t('Filter by subject...'),
          additionalSearch: (
            <div className='flex items-center gap-1'>
              <Input
                aria-label={t('Tags')}
                className='h-8 w-52'
                placeholder={t('Comma-separated tags')}
                value={tagDraft}
                onChange={(event) => setTagDraft(event.target.value)}
                onBlur={(event) => commitTagFilter(event.currentTarget.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    commitTagFilter(event.currentTarget.value)
                  }
                }}
              />
              {tagFilter.length > 0 && (
                <Button
                  type='button'
                  variant='ghost'
                  size='icon'
                  className='h-8 w-8'
                  aria-label={`${t('Reset')} ${t('Tags')}`}
                  onClick={() => commitTagFilter('')}
                >
                  <X />
                </Button>
              )}
            </div>
          ),
          filters: [
            {
              columnId: 'status',
              title: t('Status'),
              options: statusOptions,
              singleSelect: true,
            },
            {
              columnId: 'category',
              title: t('Category'),
              options: categoryOptions,
              singleSelect: true,
            },
            {
              columnId: 'priority',
              title: t('Priority'),
              options: priorityOptions,
              singleSelect: true,
            },
          ],
        }}
        bulkActions={
          permissions.canManage ? (
            <TicketBulkActions table={table} />
          ) : undefined
        }
      />
    </>
  )
}
