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
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, expect, test, vi } from 'vitest'

import { DEFAULT_LOGO } from '@/lib/constants'

import { SystemBrand } from '../system-brand'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, ...props }: React.ComponentProps<'a'>) => (
    <a {...props}>{children}</a>
  ),
}))

vi.mock('@/hooks/use-status', () => ({
  useStatus: () => ({ status: { system_name: 'Product', version: 'test' } }),
}))

vi.mock('@/hooks/use-system-config', () => ({
  useSystemConfig: () => ({ logo: 'https://assets.example.com/logo.png' }),
}))

beforeEach(() => vi.clearAllMocks())

test('falls back to the bundled logo when the configured logo fails', () => {
  render(<SystemBrand variant='inline' />)
  const logo = screen.getByRole('img', { name: 'Logo' })

  fireEvent.error(logo)

  expect(logo).toHaveAttribute('src', DEFAULT_LOGO)
})
