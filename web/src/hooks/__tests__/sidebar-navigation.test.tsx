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
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { useAuthStore } from '@/stores/auth-store'

import { useSidebarPanel } from '../use-sidebar-panel'
import { useSidebarView } from '../use-sidebar-view'

vi.mock('@/features/tickets/api', () => ({
  getMyTicketUnreadCount: async () => ({
    success: true,
    data: { unread_ticket_count: 0 },
  }),
}))
vi.mock('@/features/ticket-management/api', () => ({
  getTicketUnreadCountAdmin: async () => ({
    success: true,
    data: { unread_ticket_count: 0 },
  }),
}))

const STORAGE_KEY = 'zerocat:sidebar-panel'
const ROUTES = [
  '/channels',
  '/dashboard',
  '/security',
  '/task-plugins',
  '/ticket-management',
  '/tickets',
] as const

type RenderedSidebar = {
  panel: string
  urls: string[]
}

function SidebarProbe() {
  const { panel } = useSidebarPanel()
  const { navGroups } = useSidebarView()
  const urls = navGroups.flatMap((group) =>
    group.items.flatMap((item) => {
      if ('url' in item && item.url) return [String(item.url)]
      if ('items' in item && item.items) {
        return item.items.map((child) => String(child.url))
      }
      return []
    })
  )
  return (
    <output data-testid='sidebar'>{JSON.stringify({ panel, urls })}</output>
  )
}

async function renderSidebar({
  path,
  role,
  rememberedPanel,
  adminConfig,
}: {
  path: (typeof ROUTES)[number]
  role: number
  rememberedPanel: 'user' | 'admin'
  adminConfig?: object
}): Promise<RenderedSidebar> {
  localStorage.setItem(STORAGE_KEY, rememberedPanel)
  useAuthStore.getState().auth.setUser({
    id: 1,
    username: 'sidebar-test',
    role,
  })

  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  queryClient.setQueryData(['status'], {
    SidebarModulesAdmin: adminConfig ? JSON.stringify(adminConfig) : '',
  })
  const root = createRootRoute({ component: SidebarProbe })
  const routes = ROUTES.map((routePath) =>
    createRoute({ getParentRoute: () => root, path: routePath })
  )
  const router = createRouter({
    routeTree: root.addChildren(routes),
    history: createMemoryHistory({ initialEntries: [path] }),
  })

  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  )

  return JSON.parse(
    (await screen.findByTestId('sidebar')).textContent ?? '{}'
  ) as RenderedSidebar
}

afterEach(() => {
  cleanup()
  localStorage.clear()
  useAuthStore.getState().auth.reset()
})

describe('sidebar panel navigation contract', () => {
  it('shows root-only tools and shared analytics in the admin panel', async () => {
    const sidebar = await renderSidebar({
      path: '/task-plugins',
      role: 100,
      rememberedPanel: 'user',
    })

    expect(sidebar.panel).toBe('admin')
    expect(sidebar.urls).toEqual(
      expect.arrayContaining([
        '/channels',
        '/dashboard/overview',
        '/dashboard/models',
        '/task-plugins',
      ])
    )
    expect(
      sidebar.urls.some(
        (url) => url === '/usage-logs/common'
      )
    ).toBe(true)
  })

  it('keeps shared analytics for admins while hiding root-only tools', async () => {
    const sidebar = await renderSidebar({
      path: '/channels',
      role: 10,
      rememberedPanel: 'user',
    })

    expect(sidebar.panel).toBe('admin')
    expect(sidebar.urls).toEqual(
      expect.arrayContaining([
        '/channels',
        '/dashboard/overview',
        '/dashboard/models',
      ])
    )
    expect(sidebar.urls).not.toContain('/task-plugins')
  })

  it('keeps management links out of the ordinary user panel', async () => {
    const sidebar = await renderSidebar({
      path: '/dashboard',
      role: 1,
      rememberedPanel: 'admin',
    })

    expect(sidebar.panel).toBe('user')
    expect(sidebar.urls).toContain('/security')
    expect(sidebar.urls).not.toContain('/channels')
    expect(sidebar.urls).not.toContain('/task-plugins')
  })

  it('applies sidebar module visibility to shared admin navigation', async () => {
    const sidebar = await renderSidebar({
      path: '/channels',
      role: 100,
      rememberedPanel: 'admin',
      adminConfig: {
        console: {
          enabled: true,
          log: false,
          audit: false,
          task: false,
          midjourney: false,
        },
      },
    })

    expect(sidebar.urls).not.toContain('/usage-logs/common')
    expect(sidebar.urls).not.toContain('/usage-logs/audit')
    expect(sidebar.urls).toContain('/dashboard/models')
  })

  it.each([
    ['/task-plugins', 'user', 'admin'],
    ['/ticket-management', 'user', 'admin'],
    ['/security', 'admin', 'user'],
    ['/tickets', 'admin', 'user'],
  ] as const)(
    'assigns %s to its owning panel',
    async (path, rememberedPanel, expectedPanel) => {
      const sidebar = await renderSidebar({
        path,
        role: 100,
        rememberedPanel,
      })

      expect(sidebar.panel).toBe(expectedPanel)
    }
  )
})
