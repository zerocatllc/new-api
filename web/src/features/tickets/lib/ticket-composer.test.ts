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

import {
  canSubmitTicketMessage,
  filesWithinAttachmentLimit,
} from './ticket-composer'

describe('ticket composer behavior', () => {
  test('allows an attachment-only reply after uploads finish', () => {
    expect(canSubmitTicketMessage('', 1, false, false)).toBe(true)
    expect(canSubmitTicketMessage('   ', 0, false, false)).toBe(false)
  })

  test('blocks submission while an attachment or message is pending', () => {
    expect(canSubmitTicketMessage('ready', 0, true, false)).toBe(false)
    expect(canSubmitTicketMessage('ready', 0, false, true)).toBe(false)
  })

  test('only accepts files that fit the remaining attachment slots', () => {
    const files = [{ name: 'a' }, { name: 'b' }, { name: 'c' }]

    expect(filesWithinAttachmentLimit(files, 2, 4)).toEqual([
      { name: 'a' },
      { name: 'b' },
    ])
    expect(filesWithinAttachmentLimit(files, 4, 4)).toEqual([])
  })
})
