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
import { expect, it } from 'vitest'

import { DEFAULT_LOGO } from '@/lib/constants'

import { resolveSystemLogo } from '../use-system-config'

it('keeps the bundled logo until the configured logo is verified', () => {
  expect(
    resolveSystemLogo('https://assets.example.com/logo.png', DEFAULT_LOGO)
  ).toBe(DEFAULT_LOGO)
})

it('uses the configured logo after preloading succeeds', () => {
  const logo = 'https://assets.example.com/logo.png'
  expect(resolveSystemLogo(logo, logo)).toBe(logo)
})
