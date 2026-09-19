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
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import type { ComponentProps, ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { MobileDrawer } from '@/components/layout/components/mobile-drawer'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { STATUS_QUERY_KEY } from '@/lib/status-query'
import { useAuthStore, type AuthUser } from '@/stores/auth-store'

vi.mock('@tanstack/react-router', () => ({
  Link: (props: { children?: ReactNode; to: string }) => (
    <a href={props.to}>{props.children}</a>
  ),
  useNavigate: () => vi.fn(),
}))
vi.mock('@/components/sign-out-dialog', () => ({
  SignOutDialog: () => null,
}))
vi.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenu: (props: { children?: ReactNode }) => (
    <div>{props.children}</div>
  ),
  DropdownMenuContent: (props: { children?: ReactNode }) => (
    <div data-testid='profile-menu'>{props.children}</div>
  ),
  DropdownMenuItem: (
    props: ComponentProps<'button'> & { variant?: string }
  ) => (
    <button type='button' onClick={props.onClick}>
      {props.children}
    </button>
  ),
  DropdownMenuSeparator: () => <hr />,
  DropdownMenuTrigger: (props: { children?: ReactNode }) => (
    <div>{props.children}</div>
  ),
}))

const user: AuthUser = {
  id: 7,
  username: 'member',
  role: 1,
  permissions: { sidebar_settings: true },
}

function renderAccountNavigation(adminConfig: object, userConfig?: object) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  client.setQueryData(STATUS_QUERY_KEY, {
    SidebarModulesAdmin: JSON.stringify(adminConfig),
  })
  const configuredUser = {
    ...user,
    sidebar_modules: userConfig ? JSON.stringify(userConfig) : '',
  }
  useAuthStore.getState().auth.setUser(configuredUser)

  return render(
    <QueryClientProvider client={client}>
      <section data-testid='profile-dropdown'>
        <ProfileDropdown />
      </section>
      <section data-testid='mobile-drawer'>
        <MobileDrawer
          isOpen
          onClose={vi.fn()}
          homeUrl='/'
          displayLogo={null}
          displaySiteName='Test Product'
          loading={false}
          logoLoaded
          mobileLinksList={[]}
          showAuthButtons
          user={configuredUser}
        />
      </section>
    </QueryClientProvider>
  )
}

afterEach(() => {
  useAuthStore.getState().auth.reset()
  localStorage.clear()
})

describe('account navigation visibility', () => {
  it('honors administrator wallet and security disablement outside the sidebar', () => {
    renderAccountNavigation({
      personal: {
        enabled: true,
        personal: true,
        topup: false,
        security: false,
      },
    })

    const profile = within(screen.getByTestId('profile-dropdown'))
    const mobile = within(screen.getByTestId('mobile-drawer'))
    expect(profile.getByText('Profile')).toBeInTheDocument()
    expect(profile.queryByText('Wallet')).not.toBeInTheDocument()
    expect(profile.queryByText('Security & Access')).not.toBeInTheDocument()
    expect(mobile.getByText('Profile')).toBeInTheDocument()
    expect(mobile.queryByText('Wallet')).not.toBeInTheDocument()
    expect(mobile.queryByText('Security & Access')).not.toBeInTheDocument()
  })

  it('keeps wallet and security reachable from profile and mobile navigation when enabled', () => {
    renderAccountNavigation({
      personal: {
        enabled: true,
        personal: true,
        topup: true,
        security: true,
      },
    })

    expect(
      within(screen.getByTestId('profile-dropdown')).getByText(
        'Security & Access'
      )
    ).toBeInTheDocument()
    expect(
      within(screen.getByTestId('mobile-drawer')).getByText('Security & Access')
    ).toBeInTheDocument()
    expect(
      within(screen.getByTestId('profile-dropdown')).getByText('Wallet')
    ).toBeInTheDocument()
    expect(
      within(screen.getByTestId('mobile-drawer')).getByText('Wallet')
    ).toBeInTheDocument()
  })

  it('honors user wallet and security disablement when sidebar customization is allowed', () => {
    renderAccountNavigation(
      {
        personal: {
          enabled: true,
          personal: true,
          topup: true,
          security: true,
        },
      },
      {
        personal: {
          enabled: true,
          personal: true,
          topup: false,
          security: false,
        },
      }
    )

    expect(
      within(screen.getByTestId('profile-dropdown')).queryByText('Wallet')
    ).not.toBeInTheDocument()
    expect(
      within(screen.getByTestId('mobile-drawer')).queryByText('Wallet')
    ).not.toBeInTheDocument()
    expect(
      within(screen.getByTestId('profile-dropdown')).queryByText(
        'Security & Access'
      )
    ).not.toBeInTheDocument()
    expect(
      within(screen.getByTestId('mobile-drawer')).queryByText(
        'Security & Access'
      )
    ).not.toBeInTheDocument()
  })
})
