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
import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { StaggerContainer, StaggerItem } from '@/components/page-transition'
import { getUserQuotaDates } from '@/features/dashboard/api'
import { useSummaryCardsConfig } from '@/features/dashboard/hooks/use-dashboard-config'
import { useStatus } from '@/hooks/use-status'
import { getCurrencyLabel, isCurrencyDisplayEnabled } from '@/lib/currency'
import { formatNumber, formatQuota } from '@/lib/format'
import { requireServerSuccess } from '@/lib/server-error-message'
import { computeTimeRange } from '@/lib/time'
import { useAuthStore } from '@/stores/auth-store'

import { StatCard } from '../ui/stat-card'

export function SummaryCards() {
  const { t } = useTranslation()
  const user = useAuthStore((state) => state.auth.user)
  const { status, loading } = useStatus()

  const summaryTimeRange = useMemo(() => computeTimeRange(1), [])
  const usedQuota = Number(user?.used_quota ?? 0)
  const requestCount = Number(user?.request_count ?? 0)

  const usageTrendQuery = useQuery({
    queryKey: [
      'dashboard',
      'overview',
      'summary-recent-usage',
      summaryTimeRange.start_timestamp,
      summaryTimeRange.end_timestamp,
    ],
    queryFn: async () =>
      requireServerSuccess(
        await getUserQuotaDates({
          start_timestamp: summaryTimeRange.start_timestamp,
          end_timestamp: summaryTimeRange.end_timestamp,
          default_time: 'hour',
        })
      ),
    staleTime: 60 * 1000,
  })

  const recentUsage = useMemo(
    () =>
      (usageTrendQuery.data?.data ?? []).reduce(
        (total, item) => total + (Number(item.quota) || 0),
        0
      ),
    [usageTrendQuery.data?.data]
  )

  const currencyEnabledFromStore = isCurrencyDisplayEnabled()
  const statusCurrencyFlag =
    typeof status?.display_in_currency === 'boolean'
      ? Boolean(status.display_in_currency)
      : undefined
  const currencyEnabled =
    statusCurrencyFlag !== undefined
      ? statusCurrencyFlag
      : currencyEnabledFromStore
  const currencyLabel = currencyEnabled ? getCurrencyLabel() : 'Tokens'

  const items = useSummaryCardsConfig({
    todayUsageDisplay: formatQuota(recentUsage),
    usedDisplay: formatQuota(usedQuota),
    requestCountDisplay: formatNumber(requestCount),
    currencyEnabled,
    currencyLabel,
  }).map((config, index) => {
    const tones = ['rose', 'teal', 'gray'] as const

    return {
      key: config.key,
      title: config.title,
      value: config.value,
      desc: config.description,
      icon: config.icon,
      tone: tones[index] ?? 'gray',
    }
  })

  return (
    <div className='bg-card border-border/80 overflow-hidden rounded-xl border'>
      <div className='flex flex-col gap-3 p-4 sm:p-5'>
        <div className='flex flex-col gap-1'>
          <h3 className='text-base font-semibold'>{t('Usage at a glance')}</h3>
          <p className='text-muted-foreground text-sm'>
            {t('Monitor balance, usage, and request volume')}
          </p>
        </div>
        <StaggerContainer className='grid gap-3 md:grid-cols-3'>
          {items.map((it) => (
            <StaggerItem
              key={it.key}
              className='bg-muted/30 border-border/70 rounded-lg border p-3 shadow-xs'
            >
              <StatCard
                title={it.title}
                value={it.value}
                description={it.desc}
                icon={it.icon}
                tone={it.tone}
                loading={loading}
              />
            </StaggerItem>
          ))}
        </StaggerContainer>
      </div>
    </div>
  )
}
