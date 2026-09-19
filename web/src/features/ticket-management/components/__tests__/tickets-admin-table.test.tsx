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
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { TicketManagementProvider } from '../ticket-management-provider'
import { TicketsAdminTable } from '../tickets-admin-table'

const apiMocks = vi.hoisted(() => ({
  listAllTickets: vi.fn(),
}))

vi.mock('@/features/ticket-management/api', () => ({
  listAllTickets: apiMocks.listAllTickets,
}))

vi.mock('@tanstack/react-router', () => ({
  getRouteApi: () => ({
    useSearch: () => ({}),
    useNavigate: () => () => undefined,
  }),
}))

vi.mock('@/hooks/use-table-url-state', () => ({
  useTableUrlState: () => ({
    globalFilter: '',
    onGlobalFilterChange: vi.fn(),
    columnFilters: [],
    onColumnFiltersChange: vi.fn(),
    pagination: { pageIndex: 0, pageSize: 20 },
    onPaginationChange: vi.fn(),
    ensurePageInRange: vi.fn(),
  }),
}))

vi.mock('@/components/data-table', () => ({
  DataTablePage: (props: { emptyTitle?: string }) => (
    <div data-testid='data-table'>{props.emptyTitle}</div>
  ),
  useDataTable: () => ({ table: {} }),
}))

vi.mock('@/features/ticket-management/ticket-permissions', () => ({
  getTicketPermissions: () => ({
    canRead: true,
    canReply: false,
    canManage: false,
    canWriteSettings: false,
    canDelete: false,
  }),
}))

vi.mock(
  '@/features/ticket-management/components/tickets-admin-columns',
  () => ({
    useTicketsAdminColumns: () => [],
  })
)

vi.mock('@/features/ticket-management/components/ticket-stats-cards', () => ({
  TicketStatsCards: () => null,
}))

vi.mock('@/features/ticket-management/components/ticket-bulk-actions', () => ({
  TicketBulkActions: () => null,
}))

function renderTable() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  render(
    <QueryClientProvider client={queryClient}>
      <TicketManagementProvider>
        <TicketsAdminTable />
      </TicketManagementProvider>
    </QueryClientProvider>
  )
  return queryClient
}

describe('admin tickets table failure states', () => {
  beforeEach(() => {
    apiMocks.listAllTickets.mockReset()
  })

  it('shows an error alert with retry instead of the empty state on a business failure', async () => {
    apiMocks.listAllTickets
      .mockResolvedValueOnce({ success: false, message: 'admin list down' })
      .mockResolvedValueOnce({
        success: true,
        data: { items: [], total: 0, page: 1, page_size: 20 },
      })
    const user = userEvent.setup()
    renderTable()

    expect(await screen.findByText('Failed to load tickets')).toBeVisible()
    expect(screen.getByText('admin list down')).toBeVisible()
    expect(screen.queryByTestId('data-table')).not.toBeInTheDocument()
    expect(screen.queryByText('No Tickets Found')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await screen.findByTestId('data-table')).toBeInTheDocument()
    expect(screen.queryByText('Failed to load tickets')).not.toBeInTheDocument()
  })

  it('keeps previously loaded tickets visible with a refresh-failed banner when a refetch fails', async () => {
    apiMocks.listAllTickets
      .mockResolvedValueOnce({
        success: true,
        data: { items: [], total: 0, page: 1, page_size: 20 },
      })
      .mockResolvedValue({ success: false, message: 'refresh exploded' })
    const queryClient = renderTable()

    expect(await screen.findByTestId('data-table')).toBeInTheDocument()

    await act(async () => {
      await queryClient.refetchQueries()
    })

    expect(
      await screen.findByText('Refresh failed. Showing previously loaded data.')
    ).toBeVisible()
    expect(screen.getByTestId('data-table')).toBeInTheDocument()
    expect(screen.queryByText('Failed to load tickets')).not.toBeInTheDocument()
  })
})
