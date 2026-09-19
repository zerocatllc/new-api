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
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
} from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  TicketManagementProvider,
  useTicketManagement,
} from '@/features/ticket-management/components/ticket-management-provider'

import { ticketQueryKeys } from '../../lib/ticket-query-keys'
import { TicketsProvider, useTickets } from '../tickets-provider'

const apiMocks = vi.hoisted(() => ({
  getTicketCapabilities: vi.fn(),
}))

vi.mock('../../api', () => ({
  getTicketCapabilities: apiMocks.getTicketCapabilities,
}))

function UserRefreshHarness(props: {
  fetchUser: () => Promise<string>
  fetchAdmin: () => Promise<string>
}) {
  const { triggerRefresh } = useTickets()
  useQuery({
    queryKey: [...ticketQueryKeys.userLists, 'page'],
    queryFn: props.fetchUser,
  })
  useQuery({
    queryKey: [...ticketQueryKeys.adminLists, 'page'],
    queryFn: props.fetchAdmin,
  })
  return (
    <button type='button' onClick={triggerRefresh}>
      Refresh user tickets
    </button>
  )
}

function AdminRefreshHarness(props: {
  fetchList: () => Promise<string>
  fetchStats: () => Promise<string>
}) {
  const { triggerRefresh } = useTicketManagement()
  useQuery({
    queryKey: [...ticketQueryKeys.adminLists, 'page'],
    queryFn: props.fetchList,
  })
  useQuery({ queryKey: ticketQueryKeys.adminStats, queryFn: props.fetchStats })
  return (
    <>
      <button type='button' onClick={() => triggerRefresh()}>
        Refresh admin tickets
      </button>
      <button type='button' onClick={() => triggerRefresh({ stats: true })}>
        Refresh admin stats
      </button>
    </>
  )
}

function renderWithClient(children: React.ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  })
  return render(
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
}

describe('ticket query refresh boundaries', () => {
  beforeEach(() => {
    apiMocks.getTicketCapabilities.mockResolvedValue({
      success: true,
      data: { enabled: true, attachments_enabled: true },
    })
  })

  it('refreshes only the user ticket list from the user provider', async () => {
    const fetchUser = vi.fn().mockResolvedValue('user')
    const fetchAdmin = vi.fn().mockResolvedValue('admin')
    const user = userEvent.setup()
    renderWithClient(
      <TicketsProvider>
        <UserRefreshHarness fetchUser={fetchUser} fetchAdmin={fetchAdmin} />
      </TicketsProvider>
    )
    await waitFor(() => expect(fetchUser).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(fetchAdmin).toHaveBeenCalledTimes(1))

    await user.click(
      screen.getByRole('button', { name: 'Refresh user tickets' })
    )

    await waitFor(() => expect(fetchUser).toHaveBeenCalledTimes(2))
    expect(fetchAdmin).toHaveBeenCalledTimes(1)
  })

  it('refreshes admin stats only when the mutation changes stats', async () => {
    const fetchList = vi.fn().mockResolvedValue('list')
    const fetchStats = vi.fn().mockResolvedValue('stats')
    const user = userEvent.setup()
    renderWithClient(
      <TicketManagementProvider>
        <AdminRefreshHarness fetchList={fetchList} fetchStats={fetchStats} />
      </TicketManagementProvider>
    )
    await waitFor(() => expect(fetchList).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(fetchStats).toHaveBeenCalledTimes(1))

    await user.click(
      screen.getByRole('button', { name: 'Refresh admin tickets' })
    )
    await waitFor(() => expect(fetchList).toHaveBeenCalledTimes(2))
    expect(fetchStats).toHaveBeenCalledTimes(1)

    await user.click(
      screen.getByRole('button', { name: 'Refresh admin stats' })
    )
    await waitFor(() => expect(fetchList).toHaveBeenCalledTimes(3))
    await waitFor(() => expect(fetchStats).toHaveBeenCalledTimes(2))
  })
})
