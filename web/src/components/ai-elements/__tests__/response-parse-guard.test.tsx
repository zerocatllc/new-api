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
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, test, vi } from 'vitest'

import { Response } from '../response'

vi.mock('stream-markdown-parser', async (importOriginal) => {
  const actual = await importOriginal<typeof import('stream-markdown-parser')>()
  return {
    ...actual,
    parseMarkdownToStructure: vi.fn(() => {
      throw new RangeError('Maximum call stack size exceeded')
    }),
  }
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('Response parse guard', () => {
  test('falls back to plain text when the parser throws', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    const content = '**hello** <b>world</b>'
    render(<Response final>{content}</Response>)

    expect(screen.getByText(content)).toBeTruthy()
    expect(consoleError).toHaveBeenCalledWith(
      'Markdown parsing failed, falling back to plain text',
      expect.any(RangeError)
    )
  })
})
