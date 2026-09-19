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
import { afterEach, expect, test, vi } from 'vitest'

import { Route } from '@/routes/_authenticated/route'
import { useAuthStore } from '@/stores/auth-store'

vi.mock('@/components/layout', () => ({ AuthenticatedLayout: () => null }))
vi.mock('@/lib/auth-session', () => ({
  resolveAuthentication: vi.fn().mockResolvedValue({ kind: 'anonymous' }),
}))

afterEach(() => useAuthStore.getState().auth.reset('idle'))

test('a transient bootstrap error does not redirect a valid cookie session to sign-in', async () => {
  const guard = Route.options.beforeLoad
  if (typeof guard !== 'function') {
    throw new Error('Missing authentication guard')
  }
  const error = Object.assign(new Error('rate limited'), {
    response: { status: 429 },
  })
  const args = {
    location: { href: '/channels' },
    context: { authBootstrapResult: { kind: 'transient_error', error } },
  } as unknown as Parameters<typeof guard>[0]
  await expect(guard(args)).rejects.toBe(error)
})

test('an anonymous bootstrap still redirects to sign-in', async () => {
  const guard = Route.options.beforeLoad
  if (typeof guard !== 'function') {
    throw new Error('Missing authentication guard')
  }
  const args = {
    location: { href: '/channels' },
    context: { authBootstrapResult: { kind: 'anonymous' } },
  } as unknown as Parameters<typeof guard>[0]
  let redirect: unknown
  try {
    await guard(args)
  } catch (error) {
    redirect = error
  }
  expect(redirect).toMatchObject({
    options: { to: '/sign-in', search: { redirect: '/channels' } },
  })
})
