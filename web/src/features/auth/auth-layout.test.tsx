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
import { render, screen } from '@testing-library/react'
import { expect, test, vi } from 'vitest'

import { AuthLayout } from './auth-layout'

vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({
    data: { models: 12, providers: 4, uptimePct: 99.9 },
    isError: false,
  }),
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock('@/components/language-switcher', () => ({
  LanguageSwitcher: () => <button type='button'>Language</button>,
}))

vi.mock('@/components/layout/components/system-brand', () => ({
  SystemBrand: () => <span>zero.cat</span>,
}))

vi.mock('@/components/theme-switch', () => ({
  ThemeSwitch: () => <button type='button'>Theme</button>,
}))

vi.mock('@/hooks/use-system-config', () => ({
  useSystemConfig: () => ({ systemName: 'zero.cat' }),
}))

test('loads the selected mountain artwork only at the desktop breakpoint', () => {
  render(
    <AuthLayout>
      <form aria-label='Sign in' />
    </AuthLayout>
  )

  const artwork = screen.getByTestId('auth-mountain-artwork')
  const source = artwork.querySelector('source')
  const image = artwork.querySelector('img')

  expect(source).toHaveAttribute('media', '(min-width: 1024px)')
  expect(source).toHaveAttribute('srcset', '/auth-mountain.webp')
  expect(image).toHaveAttribute(
    'src',
    'data:image/gif;base64,R0lGODlhAQABAAAAACw='
  )
  expect(image).toHaveAttribute('alt', '')
})
