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
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { TicketManagementProvider } from '../ticket-management-provider'
import { TicketStatsCards } from '../ticket-stats-cards'

const apiMocks = vi.hoisted(() => ({
  getTicketStatsAdmin: vi.fn(),
}))

vi.mock('@/features/ticket-management/api', () => ({
  getTicketStatsAdmin: apiMocks.getTicketStatsAdmin,
}))

const stats = {
  total: 6,
  by_status: { open: 5, resolved: 1 },
  queues: {
    waiting_on_staff: 5,
    waiting_on_user: 4,
    resolved: 1,
    unassigned: 2,
    assigned_to_me: 6,
  },
}

function renderCards() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  render(
    <QueryClientProvider client={queryClient}>
      <TicketManagementProvider>
        <TicketStatsCards />
      </TicketManagementProvider>
    </QueryClientProvider>
  )
}

describe('ticket stats cards failure states', () => {
  beforeEach(() => {
    apiMocks.getTicketStatsAdmin.mockReset()
  })

  it('shows an error alert with retry instead of zero-valued tiles when stats fail to load', async () => {
    apiMocks.getTicketStatsAdmin
      .mockResolvedValueOnce({ success: false, message: 'stats backend down' })
      .mockResolvedValueOnce({ success: true, data: stats })
    const user = userEvent.setup()
    renderCards()

    expect(await screen.findByText('Failed to load ticket stats')).toBeVisible()
    expect(screen.getByText('stats backend down')).toBeVisible()
    expect(screen.queryByText('0')).not.toBeInTheDocument()
    expect(screen.queryByText('Waiting on support')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await screen.findByText('Waiting on support')).toBeVisible()
    expect(screen.getByText('5')).toBeVisible()
    expect(
      screen.queryByText('Failed to load ticket stats')
    ).not.toBeInTheDocument()
  })

  it('treats a rejected stats request as a failed query with no fabricated zeros', async () => {
    apiMocks.getTicketStatsAdmin.mockRejectedValue(
      new Error('stats unreachable')
    )
    renderCards()

    expect(await screen.findByText('Failed to load ticket stats')).toBeVisible()
    expect(screen.getByText('stats unreachable')).toBeVisible()
    expect(screen.queryByText('0')).not.toBeInTheDocument()
  })
})
