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
import { describe, expect, it, vi } from 'vitest'

import { reloadTicketDetailAfterVersionConflict } from './ticket-version-conflict'

describe('ticket detail version conflict recovery', () => {
  it('reloads the latest ticket snapshot and newest message page', async () => {
    const getTicket = vi.fn().mockResolvedValue({
      success: true,
      data: { public_id: 'ticket-id', version: 4 },
    })
    const listMessages = vi.fn().mockResolvedValue({
      success: true,
      data: [
        { id: 9, body: 'newest' },
        { id: 8, body: 'older' },
      ],
    })

    const result = await reloadTicketDetailAfterVersionConflict(
      {
        success: false,
        message: 'ticket was modified concurrently',
        data: { version_conflict: true },
      },
      getTicket,
      listMessages
    )

    expect(getTicket).toHaveBeenCalledOnce()
    expect(listMessages).toHaveBeenCalledOnce()
    expect(result).toEqual({
      ticket: { public_id: 'ticket-id', version: 4 },
      messages: [
        { id: 8, body: 'older' },
        { id: 9, body: 'newest' },
      ],
    })
  })

  it('does not reload for an unrelated business error', async () => {
    const getTicket = vi.fn()
    const listMessages = vi.fn()

    const result = await reloadTicketDetailAfterVersionConflict(
      { success: false, message: 'permission denied' },
      getTicket,
      listMessages
    )

    expect(result).toBeNull()
    expect(getTicket).not.toHaveBeenCalled()
    expect(listMessages).not.toHaveBeenCalled()
  })
})
