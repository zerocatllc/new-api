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
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { TicketManagementProvider } from './ticket-management-provider'
import { TicketTrashDialog } from './ticket-trash-dialog'

const apiMocks = vi.hoisted(() => ({
  list: vi.fn(),
  restore: vi.fn(),
  toastError: vi.fn(),
}))

vi.mock('../api', () => ({
  listDeletedTicketsAdmin: apiMocks.list,
  restoreTicketAdmin: apiMocks.restore,
}))

vi.mock('sonner', () => ({
  toast: { error: apiMocks.toastError, success: vi.fn() },
}))

function renderDialog() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <TicketManagementProvider>
        <TicketTrashDialog open onOpenChange={() => undefined} />
      </TicketManagementProvider>
    </QueryClientProvider>
  )
}

const deletedTicket = {
  public_id: 'ticket-public-id',
  user_id: 7,
  initiated_by: 'user' as const,
  subject: 'Payment question',
  category: 'billing' as const,
  priority: 'normal' as const,
  status: 'open' as const,
  waiting_on: 'staff' as const,
  assigned_to: null,
  message_count: 1,
  version: 8,
  created_at: 1,
  updated_at: 2,
  resolved_at: null,
  deleted_at: 3,
  last_message_at: 2,
  last_public_message_at: 2,
}

describe('ticket trash dialog failures', () => {
  beforeEach(() => {
    apiMocks.list.mockReset()
    apiMocks.restore.mockReset()
    apiMocks.toastError.mockReset()
  })

  it('shows an explicit retry state instead of an empty trash on list failure', async () => {
    apiMocks.list
      .mockRejectedValueOnce(new Error('trash unavailable'))
      .mockResolvedValueOnce({
        success: true,
        data: { items: [], total: 0, page: 1, page_size: 20 },
      })
    const user = userEvent.setup()
    renderDialog()

    expect(await screen.findByText('trash unavailable')).toBeVisible()
    expect(screen.queryByText('Trash is empty')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await screen.findByText('Trash is empty')).toBeVisible()
    expect(apiMocks.list).toHaveBeenCalledTimes(2)
  })

  it('treats a business-error response as a failed query', async () => {
    apiMocks.list.mockResolvedValue({
      success: false,
      message: 'trash backend unavailable',
    })
    renderDialog()

    expect(await screen.findByText('trash backend unavailable')).toBeVisible()
    expect(screen.queryByText('Trash is empty')).not.toBeInTheDocument()
  })

  it('toasts a rejected restore request instead of failing silently', async () => {
    apiMocks.list.mockResolvedValue({
      success: true,
      data: { items: [deletedTicket], total: 1, page: 1, page_size: 20 },
    })
    apiMocks.restore.mockRejectedValue(new Error('restore offline'))
    const user = userEvent.setup()
    renderDialog()

    await user.click(await screen.findByRole('button', { name: 'Restore' }))
    await waitFor(() =>
      expect(apiMocks.toastError).toHaveBeenCalledWith('restore offline')
    )
  })
})
