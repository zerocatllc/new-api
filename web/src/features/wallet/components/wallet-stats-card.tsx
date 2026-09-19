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
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  getCurrencyDisplay,
  getCurrencyLabel,
  formatQuotaWithCurrency,
} from '@/lib/currency'
import { formatQuota } from '@/lib/format'

import type { UserWalletData } from '../types'

interface WalletStatsCardProps {
  user: UserWalletData | null
  loading?: boolean
}

export function WalletStatsCard(props: WalletStatsCardProps) {
  const { t } = useTranslation()
  const quota = props.user?.quota ?? 0

  // Reference shows the raw USD equivalent as a secondary line whenever the
  // display currency is not already USD. quotaPerUnit == tokens per 1 USD, so
  // the USD amount is quota / quotaPerUnit (no fabricated rate).
  const usdSecondary = useMemo(() => {
    if (getCurrencyLabel() === 'USD') return null
    const { config } = getCurrencyDisplay()
    const perUnit = config.quotaPerUnit > 0 ? config.quotaPerUnit : 1
    const usd = quota / perUnit
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      useGrouping: false,
    }).format(usd)
  }, [quota])

  if (props.loading) {
    return (
      <Card className='flex h-full flex-col rounded-xl'>
        <CardContent className='flex-1 p-6'>
          <Skeleton className='h-3.5 w-24' />
          <Skeleton className='mt-3 h-10 w-48' />
          <Skeleton className='mt-2 h-4 w-28' />
        </CardContent>
        <div className='flex flex-wrap items-center gap-x-6 gap-y-1 border-t px-6 py-3'>
          <Skeleton className='h-4 w-32' />
          <Skeleton className='h-4 w-32' />
        </div>
      </Card>
    )
  }

  return (
    <Card className='relative isolate flex h-full flex-col overflow-hidden rounded-xl'>
      {/* Reference texture (ephone billing hero): a dot grid fading in from
          the right with a primary-tinted glow in the lower corner. Purely
          decorative; sits behind the content. */}
      <div aria-hidden='true' className='pointer-events-none absolute inset-0'>
        <div className='absolute inset-y-0 right-0 w-3/5 bg-[radial-gradient(var(--canvas-dot)_1.5px,transparent_1.5px)] [mask-image:linear-gradient(to_left,black,transparent)] [background-size:16px_16px]' />
        <div className='absolute -right-16 -bottom-28 size-72 rounded-full bg-[color-mix(in_oklab,var(--brand)_14%,transparent)] blur-3xl' />
      </div>

      <CardContent className='flex-1 p-6'>
        <p className='text-muted-foreground text-xs font-medium tracking-wide uppercase'>
          {t('Account Balance')}
        </p>
        <p className='mt-2 text-4xl font-bold tracking-tight tabular-nums sm:text-5xl'>
          {formatQuotaWithCurrency(quota, {
            digitsLarge: 2,
            digitsSmall: 2,
            abbreviate: false,
          })}
        </p>
        {usdSecondary ? (
          <p className='text-muted-foreground mt-1 text-sm'>
            ≈ {usdSecondary} USD
          </p>
        ) : null}
      </CardContent>

      <div className='text-muted-foreground flex flex-wrap items-center gap-x-6 gap-y-1 border-t px-6 py-3 text-sm'>
        <span>
          {t('Total Usage')}{' '}
          <span className='text-foreground font-medium tabular-nums'>
            {formatQuota(props.user?.used_quota ?? 0)}
          </span>
        </span>
        <span>
          {t('API Requests')}{' '}
          <span className='text-foreground font-medium tabular-nums'>
            {(props.user?.request_count ?? 0).toLocaleString()}
          </span>
        </span>
      </div>
    </Card>
  )
}
