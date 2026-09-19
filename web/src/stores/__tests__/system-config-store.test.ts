/* Copyright (C) 2023-2026 QuantumNous */
import { beforeEach, expect, it, vi } from 'vitest'

import { DEFAULT_LOGO, DEFAULT_SYSTEM_NAME } from '@/lib/constants'

import {
  DEFAULT_CURRENCY_CONFIG,
  useSystemConfigStore,
} from '../system-config-store'

beforeEach(() => {
  localStorage.clear()
  useSystemConfigStore.setState({
    config: {
      systemName: DEFAULT_SYSTEM_NAME,
      logo: DEFAULT_LOGO,
      currency: { ...DEFAULT_CURRENCY_CONFIG },
    },
    loading: true,
    loadedLogoUrl: DEFAULT_LOGO,
  })
  vi.restoreAllMocks()
})

it('migrates the unversioned persisted brand config without trusting the old logo preload state', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
  localStorage.setItem(
    'system-config-storage',
    JSON.stringify({
      version: 0,
      state: {
        config: {
          systemName: 'Existing Product',
          logo: 'https://assets.example.com/logo.png',
          currency: { ...DEFAULT_CURRENCY_CONFIG },
        },
        loadedLogoUrl: 'https://assets.example.com/logo.png',
      },
    })
  )

  await useSystemConfigStore.persist.rehydrate()

  expect(useSystemConfigStore.getState().config.systemName).toBe(
    'Existing Product'
  )
  expect(useSystemConfigStore.getState().config.logo).toBe(
    'https://assets.example.com/logo.png'
  )
  expect(useSystemConfigStore.getState().loadedLogoUrl).toBe(DEFAULT_LOGO)
})
