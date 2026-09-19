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
import { afterEach, expect, test } from 'vitest'

import { applyFaviconToDom, DEFAULT_FAVICON_URL } from './dom-utils'

afterEach(() => {
  document.head.querySelectorAll('link[rel~="icon"]').forEach((link) => {
    link.remove()
  })
})

test('restores the multi-size default favicon when the configured logo is empty', () => {
  const cached = document.createElement('link')
  cached.rel = 'icon'
  cached.href = '/cached-square-logo.png'
  document.head.appendChild(cached)

  applyFaviconToDom('')

  const icons =
    document.head.querySelectorAll<HTMLLinkElement>('link[rel~="icon"]')
  expect(icons).toHaveLength(1)
  expect(icons[0].href).toBe(
    new URL(DEFAULT_FAVICON_URL, window.location.href).href
  )
})

test('keeps the static favicon when the backend still advertises the legacy ZeroCat animation', () => {
  applyFaviconToDom('https://zero.cat/zero-cat-logo-loop.webp')

  const icon = document.head.querySelector<HTMLLinkElement>('link[rel="icon"]')
  expect(icon?.getAttribute('href')).toBe('/favicon.ico?v=20260914-transparent')
})

test('preserves an explicitly configured custom favicon', () => {
  applyFaviconToDom('https://assets.example.com/customer-logo.svg')

  const icon = document.head.querySelector<HTMLLinkElement>('link[rel="icon"]')
  expect(icon?.href).toBe('https://assets.example.com/customer-logo.svg')
})
