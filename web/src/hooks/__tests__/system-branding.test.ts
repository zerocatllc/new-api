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
import { expect, test } from 'vitest'

import { mapStatusDataToConfig } from '@/lib/status-query'

test('uses the current brand mark when status returns the legacy ZeroCat logo', () => {
  const config = mapStatusDataToConfig({
    system_name: 'ZeroCat',
    logo: 'https://zero.cat/zero-cat-logo-loop.webp',
  })

  expect(config.logo).toBe('/zerocat-logo.svg')
  expect(config.systemName).toBe('ZeroCat')
})

test('preserves an administrator-supplied custom logo', () => {
  const config = mapStatusDataToConfig({
    logo: 'https://assets.example.com/company.svg',
  })

  expect(config.logo).toBe('https://assets.example.com/company.svg')
})
