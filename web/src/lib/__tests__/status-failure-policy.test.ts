/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import { beforeEach, expect, test, vi } from 'vitest'

import { getNotice, getStatus } from '../api'

const apiGet = vi.hoisted(() => vi.fn())

vi.mock('@/lib/http-client', () => ({
  api: { get: apiGet },
}))

beforeEach(() => {
  apiGet.mockReset()
})

test('background status refresh suppresses global request error toasts', async () => {
  apiGet.mockResolvedValue({ data: { data: {} } })

  await getStatus()

  expect(apiGet).toHaveBeenCalledWith('/api/status', {
    skipBusinessError: true,
    skipErrorHandler: true,
  })
})

test('interactive notice loading preserves global request error handling', async () => {
  apiGet.mockResolvedValue({ data: { success: true, data: '' } })

  await getNotice()

  expect(apiGet).toHaveBeenCalledWith('/api/notice', {
    headers: { 'Cache-Control': null },
  })
  expect(apiGet.mock.calls[0]?.[1]).not.toMatchObject({
    skipBusinessError: true,
    skipErrorHandler: true,
  })
})
