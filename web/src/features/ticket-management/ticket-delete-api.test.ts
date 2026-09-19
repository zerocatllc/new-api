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
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  deleteTicketAdmin,
  listDeletedTicketsAdmin,
  restoreTicketAdmin,
} from './api'

const apiMocks = vi.hoisted(() => ({
  delete: vi.fn(),
  get: vi.fn(),
  post: vi.fn(),
}))

vi.mock('@/lib/api', () => ({ api: apiMocks }))

describe('ticket trash API', () => {
  beforeEach(() => {
    apiMocks.delete.mockResolvedValue({ data: { success: true, data: {} } })
    apiMocks.get.mockResolvedValue({
      data: { success: true, data: { items: [], total: 0 } },
    })
    apiMocks.post.mockResolvedValue({ data: { success: true, data: {} } })
  })

  it('sends expected_version when moving a ticket to trash', async () => {
    await deleteTicketAdmin('public-id', 7)

    expect(apiMocks.delete).toHaveBeenCalledWith(
      '/api/admin/tickets/public-id',
      { data: { expected_version: 7 }, skipBusinessError: true }
    )
  })

  it('lists trash separately and restores with expected_version', async () => {
    await listDeletedTicketsAdmin(2, 20)
    await restoreTicketAdmin('public-id', 8)

    expect(apiMocks.get).toHaveBeenCalledWith('/api/admin/tickets/trash', {
      params: { p: 2, page_size: 20 },
      skipBusinessError: true,
    })
    expect(apiMocks.post).toHaveBeenCalledWith(
      '/api/admin/tickets/trash/public-id/restore',
      { expected_version: 8 },
      { skipBusinessError: true }
    )
  })
})
