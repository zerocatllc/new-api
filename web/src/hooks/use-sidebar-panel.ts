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
import {
  useLocation,
  useNavigate,
  type LinkProps,
} from '@tanstack/react-router'
import { ShieldCheck, User, type LucideIcon } from 'lucide-react'
import { useCallback, useEffect, useSyncExternalStore } from 'react'

import type { SidebarPanel } from '@/components/layout/types'
import { EXT_ADMIN_PREFIXES, EXT_USER_PREFIXES } from '@/ext/sidebar'
import { ROLE } from '@/lib/roles'
import { useAuthStore } from '@/stores/auth-store'

type PanelDescriptor = {
  id: SidebarPanel
  /** Title / subtitle i18n keys (translate at the call site). */
  label: string
  subtitle: string
  icon: LucideIcon
  /** Where switching into this panel lands. */
  home: LinkProps['to']
  /** Keyboard shortcut hint shown in the switcher. */
  shortcut: string
}

export const SIDEBAR_PANELS: readonly PanelDescriptor[] = [
  {
    id: 'user',
    label: 'User Panel',
    subtitle: 'User Workspace',
    icon: User,
    // '/dashboard' redirects to '/dashboard/$section' (overview).
    home: '/dashboard',
    shortcut: 'F1',
  },
  {
    id: 'admin',
    label: 'Admin Panel',
    subtitle: 'Admin Console',
    icon: ShieldCheck,
    home: '/channels',
    shortcut: 'F2',
  },
] as const

// Routes owned exclusively by one panel. Navigating to one of these forces (and
// remembers) that panel. Shared routes — /logs, /dashboard, /usage-logs — appear
// in BOTH panels and deliberately do NOT switch panels, so an admin viewing logs
// from the admin console stays in the admin console.
const ADMIN_ONLY_PREFIXES = [
  '/channels',
  '/models',
  '/users',
  '/redemption-codes',
  '/subscriptions',
  '/system-info',
  '/system-settings',
  '/task-plugins',
  ...EXT_ADMIN_PREFIXES,
] as const
const USER_ONLY_PREFIXES = [
  '/playground',
  '/chat',
  '/keys',
  '/wallet',
  '/profile',
  '/security',
  ...EXT_USER_PREFIXES,
] as const

function matchesPrefix(pathname: string, prefixes: readonly string[]): boolean {
  return prefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  )
}

/** Panel a route forces, or null for shared routes that keep the current panel. */
function panelForPath(pathname: string): SidebarPanel | null {
  if (matchesPrefix(pathname, ADMIN_ONLY_PREFIXES)) return 'admin'
  if (matchesPrefix(pathname, USER_ONLY_PREFIXES)) return 'user'
  return null
}

// --- Remembered panel (localStorage) --------------------------------------
const STORAGE_KEY = 'zerocat:sidebar-panel'
const CHANGE_EVENT = 'zerocat:sidebar-panel-change'

function readStored(): SidebarPanel {
  if (typeof window === 'undefined') return 'user'
  return window.localStorage.getItem(STORAGE_KEY) === 'admin' ? 'admin' : 'user'
}

function writeStored(panel: SidebarPanel): void {
  if (typeof window === 'undefined') return
  if (readStored() === panel) return
  window.localStorage.setItem(STORAGE_KEY, panel)
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

export type UseSidebarPanel = {
  /** Currently active panel. */
  panel: SidebarPanel
  /** Whether the current user may access the admin panel. */
  canAdmin: boolean
  /** Switch panels: remember the choice and navigate to that panel's home. */
  setPanel: (next: SidebarPanel) => void
}

/**
 * Active sidebar panel.
 *
 * The choice is remembered in localStorage, but a panel-exclusive route always
 * wins (and updates the memory), so deep links resolve to the owning panel while
 * shared routes (logs / dashboard) stay in whichever panel you were in.
 */
export function useSidebarPanel(): UseSidebarPanel {
  const pathname = useLocation({ select: (l) => l.pathname })
  const role = useAuthStore((s) => s.auth.user?.role) ?? ROLE.GUEST
  const navigate = useNavigate()
  const stored = useSyncExternalStore(
    subscribe,
    readStored,
    (): SidebarPanel => 'user'
  )

  const canAdmin = role >= ROLE.ADMIN
  const forced = panelForPath(pathname)
  let panel: SidebarPanel = forced ?? stored
  if (panel === 'admin' && !canAdmin) panel = 'user'

  // Persist the panel a forced (exclusive) route implies, so shared routes
  // visited next keep it. Guard on canAdmin so a non-admin can never latch the
  // admin panel. Depend only on `forced`/`canAdmin` — deliberately NOT `stored`:
  // an explicit `setPanel` flips `stored` while the old exclusive route is still
  // mounted (navigation is async), and re-running this effect on that `stored`
  // change would clobber the choice back to the old route's panel. `writeStored`
  // already no-ops when the value is unchanged.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (forced && (forced !== 'admin' || canAdmin)) {
      writeStored(forced)
    }
  }, [forced, canAdmin])

  const setPanel = useCallback(
    (next: SidebarPanel) => {
      if (next === 'admin' && !canAdmin) return
      writeStored(next)
      const target = SIDEBAR_PANELS.find((p) => p.id === next)
      if (target) navigate({ to: target.home })
    },
    [canAdmin, navigate]
  )

  return { panel, canAdmin, setPanel }
}
