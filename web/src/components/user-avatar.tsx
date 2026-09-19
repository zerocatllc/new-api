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
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  getUserAvatarFallback,
  getUserAvatarStyle,
  getUserAvatarUrl,
} from '@/lib/avatar'
import { avatarUrl, useSelfAvatar } from '@/lib/avatar-presets'
import { useAuthStore } from '@/stores/auth-store'

interface UserAvatarProps {
  /** Seed (username/display name) the avatar is deterministically derived from. */
  name: string
  className?: string
  /**
   * When true, the identity is hidden (e.g. masked log rows): render a neutral
   * placeholder instead of the deterministic avatar so it cannot leak identity.
   */
  masked?: boolean
  /**
   * Explicit avatar image to render instead of the name-derived preset. Used by
   * {@link SelfUserAvatar} to honour the current user's locally-picked cat.
   */
  overrideSrc?: string
}

export function UserAvatar({
  name,
  className,
  masked = false,
  overrideSrc,
}: UserAvatarProps) {
  // Hooks must run before any early return. Detect whether this avatar belongs
  // to the *current* logged-in user so their locally-picked cat wins wherever
  // they appear (log rows, user dialogs, …), while every other identity keeps
  // its deterministic mapping.
  const selfUsername = useAuthStore((s) => s.auth.user?.username)
  const selfAvatar = useSelfAvatar()
  const isSelf = !masked && !!name && name === selfUsername
  const resolvedSrc =
    overrideSrc ?? (isSelf ? (avatarUrl(selfAvatar) ?? undefined) : undefined)

  if (masked) {
    return (
      <Avatar className={className}>
        <AvatarFallback>•</AvatarFallback>
      </Avatar>
    )
  }

  const seed = name || '?'
  return (
    <Avatar className={className}>
      <AvatarImage
        src={resolvedSrc ?? getUserAvatarUrl(seed)}
        alt={seed}
        className='bg-muted object-contain'
      />
      <AvatarFallback style={getUserAvatarStyle(seed)}>
        {getUserAvatarFallback(seed)}
      </AvatarFallback>
    </Avatar>
  )
}

/**
 * Avatar for the *current* logged-in user. Honours the cat they picked in the
 * avatar dialog (localStorage), falling back to the name-derived preset. Uses an
 * explicit override so it works even when the seed is a display name rather than
 * the username (e.g. the profile header).
 */
export function SelfUserAvatar(props: Omit<UserAvatarProps, 'overrideSrc'>) {
  const selfAvatar = useSelfAvatar()
  return (
    <UserAvatar {...props} overrideSrc={avatarUrl(selfAvatar) ?? undefined} />
  )
}
