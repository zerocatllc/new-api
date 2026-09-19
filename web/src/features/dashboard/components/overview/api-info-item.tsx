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
import { Zap, ExternalLink, Gauge, MoreHorizontal } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { CopyButton } from '@/components/copy-button'
import { StatusBadge } from '@/components/status-badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  getLatencyColorClass,
  openExternalSpeedTest,
} from '@/features/dashboard/lib/api-info'
import type { ApiInfoItem, PingStatus } from '@/features/dashboard/types'
import { getBgColorClass } from '@/lib/colors'
import { cn } from '@/lib/utils'

interface ApiInfoItemProps {
  item: ApiInfoItem
  status: PingStatus
  onTest: (url: string) => void
}

export function ApiInfoItemComponent(props: ApiInfoItemProps) {
  const { t } = useTranslation()
  const item = props.item
  const status = props.status

  return (
    <div className='group hover:bg-muted/40 flex items-center justify-between gap-2 px-3 py-2.5 transition-colors sm:gap-3 sm:px-5 sm:py-3'>
      <div className='flex min-w-0 flex-1 items-center gap-2 sm:gap-3'>
        <span
          className={cn(
            'inline-block size-2.5 shrink-0 rounded-full shadow-sm ring-2 ring-background',
            getBgColorClass(item.color)
          )}
        />

        <div className='flex min-w-0 flex-1 flex-col gap-1'>
          <span className='text-foreground truncate font-mono text-sm font-medium tracking-tight'>
            {item.url}
          </span>
          <div className='flex min-w-0 items-center gap-1.5'>
            <StatusBadge
              label={item.route}
              variant='info'
              size='sm'
              copyable={false}
              className='max-w-32 text-xs font-normal'
            />
            <span className='text-muted-foreground truncate text-xs'>
              {item.description}
            </span>
          </div>
        </div>
      </div>

      <div className='flex shrink-0 items-center gap-2'>
        <div className='flex items-center'>
          {status.testing && (
            <StatusBadge
              label={t('Testing...')}
              variant='warning'
              className='animate-pulse'
              copyable={false}
            />
          )}
          {status.latency !== null && !status.testing && (
            <StatusBadge
              variant='success'
              label={`${status.latency}${t('ms')}`}
              className={cn(
                'font-mono font-medium',
                getLatencyColorClass(status.latency)
              )}
              copyable={false}
            />
          )}
          {status.error && (
            <StatusBadge label={t('N/A')} variant='neutral' copyable={false} />
          )}
        </div>

        <div className='flex items-center gap-0.5'>
          <CopyButton
            value={item.url}
            variant='ghost'
            size='sm'
            className='size-7 p-0'
            iconClassName='size-3.5'
            tooltip={t('Copy URL')}
            aria-label={t('Copy URL')}
          />

          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant='ghost'
                  size='sm'
                  className='data-popup-open:bg-muted size-7 p-0'
                  aria-label={t('Open menu')}
                />
              }
            >
              <MoreHorizontal className='size-3.5' />
            </DropdownMenuTrigger>
            <DropdownMenuContent align='end' className='w-44'>
              <DropdownMenuItem
                disabled={status.testing}
                onClick={() => props.onTest(item.url)}
              >
                <Zap
                  className={cn('size-4', status.testing && 'animate-pulse')}
                />
                {t('Test Latency')}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => openExternalSpeedTest(item.url)}>
                <Gauge className='size-4' />
                {t('External Speed Test')}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() =>
                  window.open(item.url, '_blank', 'noopener,noreferrer')
                }
              >
                <ExternalLink className='size-4' />
                {t('Open in New Tab')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  )
}
