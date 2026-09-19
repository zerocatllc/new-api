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
import { describe, expect, test, vi } from 'vitest'

import { buildSetupPayload, getSetupStatus } from './api'

const apiGet = vi.hoisted(() => vi.fn())

vi.mock('@/lib/api', () => ({
  api: { get: apiGet },
}))

test('preserves interactive error handling for the setup page', async () => {
  apiGet.mockResolvedValue({ data: { success: true, data: { status: true } } })

  await getSetupStatus()

  expect(apiGet).toHaveBeenCalledWith('/api/setup', {
    params: expect.objectContaining({ t: expect.any(Number) }),
  })
})

test('forwards a caller-specific request policy', async () => {
  apiGet.mockResolvedValue({ data: { success: true, data: { status: true } } })

  await getSetupStatus({
    skipBusinessError: true,
    skipErrorHandler: true,
  })

  expect(apiGet).toHaveBeenCalledWith('/api/setup', {
    params: expect.objectContaining({ t: expect.any(Number) }),
    skipBusinessError: true,
    skipErrorHandler: true,
  })
})

describe('setup payload', () => {
  test('includes administrator fields during initial setup', () => {
    const payload = buildSetupPayload(
      {
        username: 'root',
        password: 'password123',
        confirmPassword: 'password123',
        usageMode: 'external',
      },
      false
    )

    expect(payload).toEqual({
      username: 'root',
      password: 'password123',
      confirmPassword: 'password123',
      SelfUseModeEnabled: false,
      DemoSiteEnabled: false,
    })
  })

  test('omits administrator fields when the root account already exists', () => {
    const payload = buildSetupPayload(
      {
        username: '',
        password: '',
        confirmPassword: '',
        usageMode: 'self',
      },
      true
    )

    expect(payload).toEqual({
      SelfUseModeEnabled: true,
      DemoSiteEnabled: false,
    })
  })
})
