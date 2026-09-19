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

import { Tickets } from '..'

const apiMocks = vi.hoisted(() => ({
  getTicketCapabilities: vi.fn(),
}))

vi.mock('@/features/tickets/api', () => ({
  getTicketCapabilities: apiMocks.getTicketCapabilities,
}))

vi.mock('@/features/tickets/components/tickets-table', () => ({
  TicketsTable: () => <div data-testid='tickets-table' />,
}))

vi.mock('@/features/tickets/components/tickets-dialogs', () => ({
  TicketsDialogs: () => null,
}))

vi.mock('@/features/tickets/components/tickets-primary-buttons', () => ({
  TicketsPrimaryButtons: () => null,
}))

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  render(
    <QueryClientProvider client={queryClient}>
      <Tickets />
    </QueryClientProvider>
  )
  return queryClient
}

describe('tickets page capabilities states', () => {
  beforeEach(() => {
    apiMocks.getTicketCapabilities.mockReset()
  })

  it('shows an error state with retry instead of the disabled notice when capabilities fail to load', async () => {
    apiMocks.getTicketCapabilities
      .mockRejectedValueOnce(new Error('capabilities offline'))
      .mockResolvedValueOnce({
        success: true,
        data: { enabled: true, attachments_enabled: false },
      })
    const user = userEvent.setup()
    renderPage()

    expect(
      await screen.findByText('Failed to load ticket system status')
    ).toBeVisible()
    expect(
      screen.queryByText('Ticket system is disabled')
    ).not.toBeInTheDocument()
    expect(screen.queryByTestId('tickets-table')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await screen.findByTestId('tickets-table')).toBeInTheDocument()
    expect(
      screen.queryByText('Failed to load ticket system status')
    ).not.toBeInTheDocument()
  })

  it('labels stale capabilities when a background refresh fails instead of silently showing old data', async () => {
    apiMocks.getTicketCapabilities
      .mockResolvedValueOnce({
        success: true,
        data: { enabled: true, attachments_enabled: true },
      })
      .mockRejectedValueOnce(new Error('capabilities offline'))
    const queryClient = renderPage()

    expect(await screen.findByTestId('tickets-table')).toBeInTheDocument()

    await queryClient.invalidateQueries({ queryKey: ['ticket-capabilities'] })

    expect(
      await screen.findByText('Refresh failed. Showing previously loaded data.')
    ).toBeVisible()
    expect(screen.getByTestId('tickets-table')).toBeInTheDocument()
    expect(
      screen.queryByText('Failed to load ticket system status')
    ).not.toBeInTheDocument()
  })

  it('shows the disabled notice only on a successful response reporting a disabled ticket system', async () => {
    apiMocks.getTicketCapabilities.mockResolvedValue({
      success: true,
      data: { enabled: false, attachments_enabled: false },
    })
    renderPage()

    expect(await screen.findByText('Ticket system is disabled')).toBeVisible()
    expect(screen.queryByTestId('tickets-table')).not.toBeInTheDocument()
    expect(
      screen.queryByText('Failed to load ticket system status')
    ).not.toBeInTheDocument()
  })
})
