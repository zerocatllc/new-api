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
import { Link } from '@tanstack/react-router'
import {
  Activity,
  FlaskConical,
  Link2,
  ScrollText,
  type LucideIcon,
} from 'lucide-react'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { CopyButton } from '@/components/copy-button'
import { IconBadge, type IconBadgeTone } from '@/components/ui/icon-badge'
import { resolveApiEndpoints } from '@/features/keys/lib/api-endpoints'
import { useStatus } from '@/hooks/use-status'
import { cn } from '@/lib/utils'

interface QuickLink {
  to: string
  title: string
  description: string
  icon: LucideIcon
  tone: IconBadgeTone
}

const QUICK_LINKS: QuickLink[] = [
  {
    to: '/playground',
    title: 'Playground',
    description: 'Chat with any model',
    icon: FlaskConical,
    tone: 'violet',
  },
  {
    to: '/dashboard/models',
    title: 'Dashboard',
    description: 'Usage trends and charts',
    icon: Activity,
    tone: 'sky',
  },
  {
    to: '/usage-logs/common',
    title: 'Logs',
    description: 'Requests and billing details',
    icon: ScrollText,
    tone: 'amber',
  },
]

export function QuickLinksRow() {
  const { t } = useTranslation()
  const { status } = useStatus()
  const fallbackOrigin =
    typeof window === 'undefined' ? '' : window.location.origin
  const baseUrl = useMemo(
    () => resolveApiEndpoints(status, fallbackOrigin)[0]?.url ?? '',
    [fallbackOrigin, status]
  )

  return (
    <div
      className={cn(
        'grid gap-3 sm:grid-cols-2 lg:grid-cols-3',
        baseUrl && 'xl:grid-cols-5'
      )}
    >
      {baseUrl && (
        <div className='bg-card text-card-foreground border-border/80 min-w-0 rounded-xl border p-4 sm:col-span-2 lg:col-span-3 xl:col-span-2'>
          <div className='flex items-center gap-2'>
            <IconBadge tone='emerald' size='sm'>
              <Link2 strokeWidth={1.75} />
            </IconBadge>
            <span className='text-sm font-semibold'>{t('API Base URL')}</span>
          </div>
          <div className='mt-3 flex items-center gap-2'>
            <code className='bg-muted/40 border-border/70 min-w-0 flex-1 truncate rounded-lg border px-3 py-2 font-mono text-xs'>
              {baseUrl}
            </code>
            <CopyButton
              value={baseUrl}
              variant='outline'
              className='size-9 shrink-0'
              iconClassName='size-4'
              tooltip={t('Copy URL')}
              aria-label={t('Copy URL')}
            />
          </div>
        </div>
      )}

      {QUICK_LINKS.map((link) => (
        <Link
          key={link.to}
          to={link.to}
          className='bg-card text-card-foreground border-border/80 hover:border-brand/50 hover:bg-muted/25 flex min-w-0 items-start gap-3 rounded-xl border p-4 transition-colors'
        >
          <IconBadge tone={link.tone} size='lg'>
            <link.icon strokeWidth={1.75} />
          </IconBadge>
          <div className='min-w-0'>
            <p className='truncate text-sm font-semibold'>{t(link.title)}</p>
            <p className='text-muted-foreground mt-0.5 line-clamp-2 text-xs'>
              {t(link.description)}
            </p>
          </div>
        </Link>
      ))}
    </div>
  )
}
