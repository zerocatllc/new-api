/* Copyright (C) 2023-2026 QuantumNous */
import { afterEach, expect, it } from 'vitest'

import { setSelfAvatar } from '@/lib/avatar-presets'
import { useAuthStore } from '@/stores/auth-store'

afterEach(() => {
  useAuthStore.getState().auth.setUser(null)
  localStorage.clear()
})

it('stores avatar choices independently for each signed-in account', () => {
  useAuthStore.getState().auth.setUser({ id: 1, username: 'alice', role: 1 })
  setSelfAvatar('cat-01.webp')
  useAuthStore.getState().auth.setUser({ id: 2, username: 'bob', role: 1 })
  setSelfAvatar('cat-02.webp')
  expect(localStorage.getItem('zerocat:self-avatar:1')).toBe('cat-01.webp')
  expect(localStorage.getItem('zerocat:self-avatar:2')).toBe('cat-02.webp')
  expect(localStorage.getItem('zerocat:self-avatar')).toBeNull()
})
