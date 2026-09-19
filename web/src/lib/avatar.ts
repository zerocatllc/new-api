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
import type { CSSProperties } from 'react'

import { AVATAR_PRESETS, avatarUrl } from './avatar-presets'

export type UserAvatarStyle = Pick<
  CSSProperties,
  'backgroundColor' | 'backgroundImage' | 'color'
>

function hashString(value: string): number {
  let hash = 0
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0
  }
  return hash
}

// Deterministic two-tone gradient derived from the name. Used only as the
// fallback chip behind the illustrated avatar (e.g. before the SVG loads or if
// it fails), so every user still gets a distinct, colorful placeholder.
export function getUserAvatarStyle(name: string): UserAvatarStyle {
  const hash = hashString(name)
  const hue = hash % 360
  // Second hue offset by 40-120deg for a vivid but harmonious duo-tone.
  const hue2 = (hue + 40 + ((hash >> 8) % 80)) % 360

  return {
    backgroundColor: `hsl(${hue} 60% 52%)`,
    backgroundImage: `linear-gradient(135deg, hsl(${hue} 68% 56%), hsl(${hue2} 64% 46%))`,
    color: 'white',
  }
}

export function getUserAvatarFallback(name: string): string {
  return name.trim().charAt(0).toUpperCase() || '?'
}

// ---------------------------------------------------------------------------
// Deterministic illustrated avatar.
//
// Every user maps to one cat from the shared preset set (see
// `lib/avatar-presets`) by hashing their name. Same name -> same cat, every
// render. The current user can override this with their own pick (localStorage);
// other users (e.g. log rows) always use this deterministic mapping.
// ---------------------------------------------------------------------------

export function getUserAvatarUrl(name: string): string {
  const seed = name || '?'
  const preset = AVATAR_PRESETS[hashString(seed) % AVATAR_PRESETS.length]
  // `avatarUrl` always resolves a known preset to a non-null URL.
  return avatarUrl(preset) as string
}
