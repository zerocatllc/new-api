/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import { beforeEach, expect, test, vi } from 'vitest'

import { getHomePageContent, getHomeStats } from '../api'

const apiGet = vi.hoisted(() => vi.fn())

vi.mock('@/lib/api', () => ({
  api: { get: apiGet },
}))

beforeEach(() => {
  apiGet.mockReset()
})

test('optional homepage content suppresses global request error toasts', async () => {
  apiGet.mockResolvedValue({ data: { success: true, data: '' } })

  await getHomePageContent()

  expect(apiGet).toHaveBeenCalledWith('/api/home_page_content', {
    headers: { 'Cache-Control': null },
    skipBusinessError: true,
    skipErrorHandler: true,
  })
})

test('optional homepage pricing suppresses global request error toasts', async () => {
  apiGet.mockResolvedValue({
    data: { success: true, data: [], vendors: [] },
  })

  await getHomeStats()

  expect(apiGet).toHaveBeenCalledWith('/api/pricing', {
    skipBusinessError: true,
    skipErrorHandler: true,
  })
})
