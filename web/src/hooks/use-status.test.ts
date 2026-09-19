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
import { cleanup, renderHook, waitFor } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { afterEach, describe, expect, test } from 'vitest'

import { api } from '@/lib/api'
import { useSystemConfigStore } from '@/stores/system-config-store'

import { useSystemConfig } from './use-system-config'

type ApiMethod = (url: string) => Promise<{ data: unknown }>
type MockableApi = { get: ApiMethod }

const apiClient = api as unknown as MockableApi
const originalGet = apiClient.get

function wrapper(queryClient: QueryClient) {
  return function QueryWrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: queryClient }, children)
  }
}

afterEach(() => {
  cleanup()
  apiClient.get = originalGet
  useSystemConfigStore.setState(useSystemConfigStore.getInitialState(), true)
})

describe('useSystemConfig loading lifecycle', () => {
  test('syncs status into the config store and clears loading', async () => {
    let resolveStatus!: (value: { data: unknown }) => void
    apiClient.get = () =>
      new Promise((resolve) => {
        resolveStatus = resolve
      })
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })

    renderHook(() => useSystemConfig({ autoLoad: true }), {
      wrapper: wrapper(queryClient),
    })

    await waitFor(() =>
      expect(useSystemConfigStore.getState().loading).toBe(true)
    )
    resolveStatus({
      data: { success: true, data: { system_name: 'Test API' } },
    })
    await waitFor(() =>
      expect(useSystemConfigStore.getState().loading).toBe(false)
    )
    expect(useSystemConfigStore.getState().config.systemName).toBe('Test API')
    queryClient.clear()
  })

  test('clears loading when the shared status request fails', async () => {
    apiClient.get = async () => {
      throw new Error('offline')
    }
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })

    renderHook(() => useSystemConfig({ autoLoad: true }), {
      wrapper: wrapper(queryClient),
    })

    await waitFor(() =>
      expect(useSystemConfigStore.getState().loading).toBe(false)
    )
    queryClient.clear()
  })
})
