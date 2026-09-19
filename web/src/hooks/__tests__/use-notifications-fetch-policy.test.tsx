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
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'

import { useAuthStore } from '@/stores/auth-store'

import { useNotifications } from '../use-notifications'

const getNotice = vi.hoisted(() => vi.fn())

vi.mock('@/lib/api', () => ({ getNotice }))

vi.mock('@/hooks/use-status', () => ({
  useStatus: () => ({ status: null, loading: false }),
}))

function NotificationProbe() {
  const notifications = useNotifications()

  return (
    <button type='button' onClick={() => notifications.setPopoverOpen(true)}>
      Open notifications
    </button>
  )
}

function renderProbe() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <NotificationProbe />
    </QueryClientProvider>
  )
}

afterEach(() => {
  useAuthStore.getState().auth.reset()
  getNotice.mockReset()
})

test('does not fetch notices for a signed-out visitor until the popover opens', async () => {
  getNotice.mockResolvedValue({ success: true, data: '' })

  renderProbe()

  expect(getNotice).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Open notifications' }))

  await waitFor(() => expect(getNotice).toHaveBeenCalledTimes(1))
})

test('keeps eager notice loading for an authenticated user', async () => {
  getNotice.mockResolvedValue({ success: true, data: '' })
  useAuthStore.getState().auth.setUser({
    id: 1,
    username: 'tester',
    role: 1,
  })

  renderProbe()

  await waitFor(() => expect(getNotice).toHaveBeenCalledTimes(1))
})
