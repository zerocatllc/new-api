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
  attachmentFileName,
  buildTicketDownloadHref,
  isTicketImage,
} from './ticket-attachments'

describe('ticket attachment presentation', () => {
  test('recognizes only supported image extensions', () => {
    expect(isTicketImage('https://files.example/a.JPG?x=1')).toBe(true)
    expect(isTicketImage('https://files.example/a.pdf')).toBe(false)
  })

  test('decodes the displayed filename', () => {
    expect(
      attachmentFileName('https://files.example/tickets/report%20final.pdf')
    ).toBe('report final.pdf')
  })

  test('builds the authenticated download endpoint for each mode', () => {
    const url = 'https://files.example/a b.pdf'
    expect(buildTicketDownloadHref(url, 'user')).toBe(
      `/api/tickets/download?url=${encodeURIComponent(url)}`
    )
    expect(buildTicketDownloadHref(url, 'admin')).toBe(
      `/api/admin/tickets/download?url=${encodeURIComponent(url)}`
    )
  })

  test('requests inline disposition only for image previews', () => {
    const imageUrl = 'https://files.example/preview.png'
    expect(buildTicketDownloadHref(imageUrl, 'user')).toBe(
      `/api/tickets/download?url=${encodeURIComponent(imageUrl)}&inline=1`
    )
    expect(
      buildTicketDownloadHref('https://files.example/report.txt', 'user')
    ).toBe(
      `/api/tickets/download?url=${encodeURIComponent('https://files.example/report.txt')}`
    )
  })
})
