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
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it } from 'vitest'

import { SidebarProvider } from '@/components/ui/sidebar'
import { useAuthStore } from '@/stores/auth-store'

import { SidebarPanelSwitcher } from '../sidebar-panel-switcher'

beforeEach(() => {
  localStorage.clear()
  useAuthStore
    .getState()
    .auth.setUser({ id: 1, username: 'sidebar-test', role: 100 })
})
afterEach(() => {
  useAuthStore.getState().auth.setUser(null)
  localStorage.clear()
})
function mount(open: boolean, initialPath = '/channels') {
  const root = createRootRoute({
    component: () => (
      <SidebarProvider open={open}>
        <SidebarPanelSwitcher />
      </SidebarProvider>
    ),
  })
  const routes = ['channels', 'dashboard', 'ticket-management'].map(
    (path) => createRoute({ getParentRoute: () => root, path })
  )
  const router = createRouter({
    routeTree: root.addChildren(routes),
    history: createMemoryHistory({ initialEntries: [initialPath] }),
  })
  render(<RouterProvider router={router} />)
  return router
}
it('keeps collapsed panel switching accessible without squeezed text', async () => {
  const router = mount(false)
  const trigger = await screen.findByRole('button', {
    name: 'Admin Panel',
  })
  expect(screen.queryByText('Admin Console')).not.toBeInTheDocument()
  await userEvent.click(trigger)
  expect(await screen.findByRole('menu')).toHaveClass('z-70')
  await userEvent.click(
    await screen.findByRole('menuitem', { name: /User Panel/ })
  )
  await waitFor(() => expect(router.state.location.pathname).toBe('/dashboard'))
  expect(screen.getByRole('button', { name: 'User Panel' })).toBeVisible()
})
it('shows panel context when the sidebar is expanded', async () => {
  mount(true)
  expect(await screen.findByText('Admin Console')).toBeVisible()
})

it('uses admin navigation for the ticket management deep link', async () => {
  localStorage.setItem('zerocat:sidebar-panel', 'user')
  const router = mount(false, '/ticket-management')
  expect(
    await screen.findByRole('button', { name: 'Admin Panel' })
  ).toBeVisible()
  expect(router.state.location.pathname).toBe('/ticket-management')
})
