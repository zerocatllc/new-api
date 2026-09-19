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

import { cn } from '@/lib/utils'
import { useSystemConfigStore } from '@/stores/system-config-store'

interface LoadingStateProps {
  className?: string
  message?: string
  size?: 'sm' | 'md' | 'lg'
  inline?: boolean
}

const wordmarkSizeMap = {
  sm: 'text-sm',
  md: 'text-lg',
  lg: 'text-2xl',
} as const

/* The loading language has exactly two voices: the pulsing brand wordmark
 * (splash, route pending, and — via this component — any in-place load) and
 * content skeletons for data regions whose layout is stable. No rings, no
 * dots, no bespoke spinners. */
function BrandWordmark(props: { size: 'sm' | 'md' | 'lg' }) {
  const systemName = useSystemConfigStore((state) => state.config.systemName)
  return (
    <span
      aria-hidden='true'
      className={cn(
        wordmarkSizeMap[props.size],
        'font-heading text-brand animate-pulse font-extrabold tracking-wide motion-reduce:animate-none'
      )}
    >
      {systemName}
    </span>
  )
}

export function LoadingState(props: LoadingStateProps) {
  const { t } = useTranslation()
  const size = props.size ?? 'md'

  if (props.inline) {
    return (
      <span
        role='status'
        aria-label={props.message ?? t('Loading...')}
        className={cn('inline-flex items-center gap-2', props.className)}
      >
        <BrandWordmark size={size} />
        {props.message != null && (
          <span aria-hidden='true' className='text-muted-foreground text-sm'>
            {props.message}
          </span>
        )}
      </span>
    )
  }

  return (
    <div
      role='status'
      className={cn(
        'flex min-h-[200px] flex-col items-center justify-center gap-3',
        props.className
      )}
    >
      <BrandWordmark size={size} />
      <p className='text-muted-foreground text-sm'>
        {props.message ?? t('Loading...')}
      </p>
    </div>
  )
}
