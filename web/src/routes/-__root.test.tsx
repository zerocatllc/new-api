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
import { expect, test, vi } from 'vitest'

const getSetupStatus = vi.hoisted(() => vi.fn())
const bootstrapAuthentication = vi.hoisted(() => vi.fn())

vi.mock('@/features/setup/api', () => ({ getSetupStatus }))

vi.mock('@/lib/auth-session', () => ({
  bootstrapAuthentication,
  clearAuthenticatedClientState: vi.fn(),
  clearAuthentication: vi.fn(),
}))

vi.mock('@/lib/auth-session-sync', () => ({
  subscribeAuthSessionEvents: vi.fn(),
}))

vi.mock('@/lib/legacy-route', () => ({ resolveLegacyRoute: () => null }))

test('silences only the root setup bootstrap probe', async () => {
  window.localStorage.removeItem('setup_status_checked_v2')
  getSetupStatus.mockResolvedValue({
    success: true,
    data: { status: true },
  })
  bootstrapAuthentication.mockResolvedValue(undefined)
  const { Route } = await import('./__root')

  await Route.options.beforeLoad?.({
    location: {
      href: 'http://localhost/',
      pathname: '/',
    },
  } as never)

  expect(getSetupStatus).toHaveBeenCalledWith({
    skipBusinessError: true,
    skipErrorHandler: true,
  })
})
