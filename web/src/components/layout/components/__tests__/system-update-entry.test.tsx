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
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ROLE } from '@/lib/roles'
import { useAuthStore } from '@/stores/auth-store'

import { AppHeader } from '../app-header'
import { PublicHeader } from '../public-header'

vi.mock('@tanstack/react-router', () => ({
  Link: (props: { children?: ReactNode; to: string }) => (
    <a href={props.to}>{props.children}</a>
  ),
  useNavigate: () => vi.fn(),
  useRouterState: () => ({ location: { pathname: '/' } }),
}))
vi.mock('@/components/dialog', () => ({ Dialog: () => null }))
vi.mock('@/components/config-drawer', () => ({ ConfigDrawer: () => null }))
vi.mock('@/components/language-switcher', () => ({
  LanguageSwitcher: () => null,
}))
vi.mock('@/components/notification-popover', () => ({
  NotificationPopover: () => null,
}))
vi.mock('@/components/profile-dropdown', () => ({
  ProfileDropdown: () => null,
}))
vi.mock('@/components/search', () => ({ Search: () => null }))
vi.mock('@/components/theme-switch', () => ({ ThemeSwitch: () => null }))
vi.mock('@/features/system-update/system-update-dialog', () => ({
  SystemUpdateDialog: (props: { trigger: ReactNode }) => props.trigger,
}))
vi.mock('@/features/system-update/use-system-update', () => ({
  useSystemUpdate: () => ({
    checking: false,
    currentVersion: 'v-test',
    release: null,
    shouldNotify: false,
    snapshot: null,
  }),
}))
vi.mock('@/hooks/use-notifications', () => ({
  useNotifications: () => ({
    popoverOpen: false,
    setPopoverOpen: vi.fn(),
    unreadCount: 0,
    activeTab: 'notice',
    setActiveTab: vi.fn(),
    notice: null,
    announcements: [],
    loading: false,
  }),
}))
vi.mock('@/hooks/use-system-config', () => ({
  useSystemConfig: () => ({
    systemName: 'ZeroCat',
    logo: '',
    loading: false,
    logoLoaded: true,
  }),
}))
vi.mock('@/hooks/use-top-nav-links', () => ({ useTopNavLinks: () => [] }))
vi.mock('../header', () => ({
  Header: (props: { children?: ReactNode }) => (
    <header>{props.children}</header>
  ),
}))
vi.mock('../header-logo', () => ({ HeaderLogo: () => null }))
vi.mock('../system-brand', () => ({ SystemBrand: () => <span>ZeroCat</span> }))
vi.mock('../top-nav', () => ({ TopNav: () => null }))

afterEach(() => {
  useAuthStore.getState().auth.reset()
})

describe.each([
  ['application', AppHeader],
  ['public', PublicHeader],
])('%s header update entry', (_name, HeaderComponent) => {
  it('is mounted for administrators and hidden from ordinary users', () => {
    useAuthStore
      .getState()
      .auth.setUser({ id: 1, username: 'user', role: ROLE.USER })
    const view = render(<HeaderComponent />)
    expect(
      screen.queryByRole('button', {
        name: 'System updates, current version: v-test',
      })
    ).not.toBeInTheDocument()

    useAuthStore
      .getState()
      .auth.setUser({ id: 2, username: 'admin', role: ROLE.ADMIN })
    view.rerender(<HeaderComponent />)
    expect(
      screen.getByRole('button', {
        name: 'System updates, current version: v-test',
      })
    ).toBeInTheDocument()
  })

  if (_name === 'application') {
    it('keeps the brand container measurable for its container query', () => {
      useAuthStore
        .getState()
        .auth.setUser({ id: 2, username: 'admin', role: ROLE.ADMIN })
      render(<HeaderComponent />)

      expect(screen.getByText('ZeroCat').parentElement).toHaveClass(
        'flex-1',
        'min-w-0'
      )
    })
  }
})
