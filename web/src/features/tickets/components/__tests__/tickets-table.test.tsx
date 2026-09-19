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

import { TicketsProvider } from '../tickets-provider'
import { TicketsTable } from '../tickets-table'

const apiMocks = vi.hoisted(() => ({
  listMyTickets: vi.fn(),
  getTicketCapabilities: vi.fn(),
}))

vi.mock('@/features/tickets/api', () => ({
  listMyTickets: apiMocks.listMyTickets,
  getTicketCapabilities: apiMocks.getTicketCapabilities,
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

vi.mock('@/features/tickets/components/tickets-columns', () => ({
  useTicketsColumns: () => [],
}))

vi.mock('@/features/tickets/components/tickets-mobile-list', () => ({
  TicketsMobileList: () => null,
}))

function renderTable() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  render(
    <QueryClientProvider client={queryClient}>
      <TicketsProvider>
        <TicketsTable />
      </TicketsProvider>
    </QueryClientProvider>
  )
  return queryClient
}

describe('tickets table failure states', () => {
  beforeEach(() => {
    apiMocks.listMyTickets.mockReset()
    apiMocks.getTicketCapabilities.mockReset()
    apiMocks.getTicketCapabilities.mockResolvedValue({
      success: true,
      data: { enabled: true, attachments_enabled: false },
    })
  })

  it('shows an error alert with retry instead of the empty state on a business failure', async () => {
    apiMocks.listMyTickets
      .mockResolvedValueOnce({
        success: false,
        message: 'tickets backend down',
      })
      .mockResolvedValueOnce({
        success: true,
        data: { items: [], total: 0, page: 1, page_size: 20 },
      })
    const user = userEvent.setup()
    renderTable()

    expect(await screen.findByText('Failed to load tickets')).toBeVisible()
    expect(screen.getByText('tickets backend down')).toBeVisible()
    expect(screen.queryByTestId('data-table')).not.toBeInTheDocument()
    expect(screen.queryByText('No Support Tickets Yet')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await screen.findByTestId('data-table')).toBeInTheDocument()
    expect(screen.queryByText('Failed to load tickets')).not.toBeInTheDocument()
  })

  it('keeps previously loaded tickets visible with a refresh-failed banner when a refetch fails', async () => {
    apiMocks.listMyTickets
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
