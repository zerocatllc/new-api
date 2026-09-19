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
import { describe, expect, test } from 'vitest'

import { clearTicketDeepLink, ticketPublicIdSchema } from './ticket-deep-link'

describe('ticket deep links', () => {
  test('accepts only canonical ticket public ids', () => {
    expect(ticketPublicIdSchema.parse('0123456789abcdef0123456789abcdef')).toBe(
      '0123456789abcdef0123456789abcdef'
    )
    expect(ticketPublicIdSchema.parse('abc123')).toBeUndefined()
    expect(ticketPublicIdSchema.parse('../admin')).toBeUndefined()
  })

  test('closing a deep-linked ticket preserves list state', () => {
    expect(
      clearTicketDeepLink({
        page: 3,
        filter: 'upload',
        ticket: '0123456789abcdef0123456789abcdef',
      })
    ).toEqual({
      page: 3,
      filter: 'upload',
      ticket: undefined,
    })
  })
})
