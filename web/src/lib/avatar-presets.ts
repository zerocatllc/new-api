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
import { useSyncExternalStore } from 'react'

import { useAuthStore } from '@/stores/auth-store'

// Illustrated cat avatar presets served from `public/avatars/cats/`.
// Structure mirrors rix-api's `lib/avatar-presets.ts`; the difference is
// persistence: this backend has no user `avatar` column, so the chosen preset
// is stored in localStorage (per-browser) instead of committed to the server.
export const AVATAR_PRESETS = [
  'cat-40.webp', // default (matches the zero.cat brand mark)
  'cat-01.webp',
  'cat-02.webp',
  'cat-03.webp',
  'cat-04.webp',
  'cat-05.webp',
  'cat-06.webp',
  'cat-07.webp',
  'cat-08.webp',
  'cat-09.webp',
  'cat-10.webp',
  'cat-11.webp',
  'cat-12.webp',
  'cat-13.webp',
  'cat-14.webp',
  'cat-15.webp',
  'cat-16.webp',
  'cat-17.webp',
  'cat-18.webp',
  'cat-19.webp',
  'cat-20.webp',
  'cat-21.webp',
  'cat-22.webp',
  'cat-23.webp',
  'cat-24.webp',
  'cat-25.webp',
  'cat-26.webp',
  'cat-27.webp',
  'cat-28.webp',
  'cat-29.webp',
  'cat-30.webp',
  'cat-31.webp',
  'cat-32.webp',
  'cat-33.webp',
  'cat-34.webp',
  'cat-35.webp',
  'cat-36.webp',
  'cat-37.webp',
  'cat-38.webp',
  'cat-39.webp',
] as const

const AVATAR_PRESET_NAMES = new Set<string>(AVATAR_PRESETS)
const AVATAR_BASE_PATH = '/avatars/cats'

export type AvatarPreset = (typeof AVATAR_PRESETS)[number]

export function resolveAvatarName(name?: string | null): AvatarPreset | null {
  if (name && AVATAR_PRESET_NAMES.has(name)) return name as AvatarPreset
  return null
}

/** Resolve a stored preset filename to its served URL, or null if unset. */
export function avatarUrl(name?: string | null): string | null {
  const preset = resolveAvatarName(name)
  return preset ? `${AVATAR_BASE_PATH}/${preset}` : null
}

// ---------------------------------------------------------------------------
// Local persistence keeps this frontend-only preference out of the account API.
//
// Same-tab listeners: the native `storage` event only fires in *other* tabs, so
// selection also emits a custom event to update the current tab live.
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'zerocat:self-avatar'
const CHANGE_EVENT = 'zerocat:self-avatar-change'

function getStorageKey(userId?: number): string | null {
  return userId ? `${STORAGE_KEY}:${userId}` : null
}

function readStored(userId?: number): AvatarPreset | null {
  if (typeof window === 'undefined') return null
  const key = getStorageKey(userId)
  return key ? resolveAvatarName(window.localStorage.getItem(key)) : null
}

/** Persist the chosen preset (or clear it to fall back to the auto avatar). */
export function setSelfAvatar(name: string | null): void {
  if (typeof window === 'undefined') return
  const key = getStorageKey(useAuthStore.getState().auth.user?.id)
  if (!key) return
  const preset = resolveAvatarName(name)
  if (preset) {
    window.localStorage.setItem(key, preset)
  } else {
    window.localStorage.removeItem(key)
  }
  window.localStorage.removeItem(STORAGE_KEY)
  window.dispatchEvent(new Event(CHANGE_EVENT))
}

function subscribe(callback: () => void): () => void {
  window.addEventListener(CHANGE_EVENT, callback)
  window.addEventListener('storage', callback)
  return () => {
    window.removeEventListener(CHANGE_EVENT, callback)
    window.removeEventListener('storage', callback)
  }
}

/** Reactive current-user avatar preset, or null when using the auto avatar. */
export function useSelfAvatar(): AvatarPreset | null {
  const userId = useAuthStore((state) => state.auth.user?.id)
  return useSyncExternalStore(
    subscribe,
    () => readStored(userId),
    () => null
  )
}
