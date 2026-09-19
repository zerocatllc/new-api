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
import { useTranslation } from 'react-i18next'

import { useSystemConfig } from '@/hooks/use-system-config'

/**
 * Full-screen brand mark used as the router `defaultPendingComponent`.
 *
 * It mirrors the `#app-loading` wordmark in index.html so the handoff is
 * seamless: the HTML loader covers HTML-load → router idle, then this covers
 * any pending route match (Outlet Suspense fallback) — auth guard `getSelf()`
 * and lazy route-component chunks — which would otherwise render blank white
 * (Match.js falls back to `null` when no pending component is configured).
 * Same visual, so a slow chunk reads as the splash lingering, not a second
 * loader.
 */
export function AppSpinner() {
  const { systemName } = useSystemConfig()
  const { t } = useTranslation()
  return (
    <div
      role='status'
      aria-label={t('Loading...')}
      className='bg-background fixed inset-0 z-[9999] flex items-center justify-center px-6'
    >
      <span
        aria-hidden='true'
        className='font-heading text-brand animate-pulse text-3xl font-extrabold tracking-wide motion-reduce:animate-none'
      >
        {systemName}
      </span>
    </div>
  )
}
