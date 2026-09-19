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
import { X } from 'lucide-react'
import { useState } from 'react'

import { cn } from '@/lib/utils'

import {
  useHomeSections,
  type BannerTheme,
} from '../../hooks/use-home-sections'

const THEME_STYLES: Record<BannerTheme, string> = {
  default: 'bg-muted/60 text-foreground border-border/60',
  // `info` reads as the neutral editorial banner (no brand blue); semantic
  // success / warning / error below keep their state colors.
  info: 'bg-muted/60 text-foreground border-border/60',
  success:
    'bg-emerald-500/10 text-emerald-700 border-emerald-500/20 dark:text-emerald-300',
  warning:
    'bg-amber-500/10 text-amber-700 border-amber-500/20 dark:text-amber-300',
  error: 'bg-red-500/10 text-red-700 border-red-500/20 dark:text-red-300',
}

/**
 * Announcement bar driven by `status.banner`. Renders nothing unless the
 * backend has an enabled banner with content. (The landing page renders its
 * own marketing strip inside the sticky header; this component stays for the
 * custom-home-content branch and backend-driven banners.)
 */
export function AnnouncementBanner() {
  const { banner } = useHomeSections()
  const [dismissed, setDismissed] = useState(false)

  if (!banner || dismissed) return null

  return (
    <div
      className={cn(
        'relative z-20 border-b px-4 py-2.5 text-center text-sm',
        THEME_STYLES[banner.theme]
      )}
    >
      <div className='mx-auto flex max-w-6xl items-center justify-center gap-2'>
        {banner.icon && (
          <img src={banner.icon} alt='' className='size-4 shrink-0' />
        )}
        <span className='leading-relaxed'>{banner.content}</span>
        {banner.linkUrl && (
          <a
            href={banner.linkUrl}
            target='_blank'
            rel='noopener noreferrer'
            className='font-medium underline underline-offset-2'
          >
            {banner.linkText || banner.linkUrl}
          </a>
        )}
      </div>
      {banner.closable && (
        <button
          type='button'
          aria-label='Dismiss'
          onClick={() => setDismissed(true)}
          className='absolute top-1/2 right-4 -translate-y-1/2 opacity-60 transition-opacity hover:opacity-100'
        >
          <X className='size-4' />
        </button>
      )}
    </div>
  )
}
