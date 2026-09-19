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
import { useTranslation } from 'react-i18next'

import { LanguageSwitcher } from '@/components/language-switcher'
import { SystemBrand } from '@/components/layout/components/system-brand'
import { ThemeSwitch } from '@/components/theme-switch'
import { getHomeStats } from '@/features/home/api'
import { useSystemConfig } from '@/hooks/use-system-config'

const dotGrid =
  'pointer-events-none absolute inset-0 bg-[radial-gradient(var(--border)_1px,transparent_1px)] bg-[size:22px_22px]'

type AuthLayoutProps = {
  children: React.ReactNode
}

export function AuthLayout({ children }: AuthLayoutProps) {
  const { t } = useTranslation()
  const { systemName } = useSystemConfig()
  const { data: stats, isError: statsError } = useQuery({
    queryKey: ['home-stats'],
    queryFn: getHomeStats,
    staleTime: 5 * 60 * 1000,
  })
  // A failed stats fetch must not masquerade as real zeros.
  const statsUnavailable = statsError && !stats
  const statItems = [
    {
      value: statsUnavailable ? '—' : `${stats?.models ?? 0}+`,
      label: t('AI Models'),
    },
    {
      value: statsUnavailable ? '—' : `${stats?.providers ?? 0}+`,
      label: t('AI Providers'),
    },
    {
      value: statsUnavailable ? '—' : `${(stats?.uptimePct ?? 0).toFixed(1)}%`,
      label: t('Uptime SLA'),
    },
  ]

  // Immersive split screen (ephone reference): no site header — the artwork
  // owns the full left half, and the brand + switchers float inside the form
  // column instead.
  return (
    <div className='bg-background text-foreground relative h-svh overflow-x-clip'>
      <div className='grid h-full lg:grid-cols-2'>
        {/* Full-bleed brand artwork (fixed dark image regardless of theme, so
            the overlay text uses fixed light tones instead of theme tokens);
            the mountain peak sits right-of-center, so copy stays bottom-left
            over the darkest area with a soft gradient for legibility. */}
        <div className='relative hidden min-h-0 flex-col justify-end overflow-hidden border-r lg:flex'>
          <picture
            data-testid='auth-mountain-artwork'
            aria-hidden='true'
            className='absolute inset-0'
          >
            <source
              media='(min-width: 1024px)'
              srcSet='/auth-mountain.webp'
              type='image/webp'
            />
            <img
              src='data:image/gif;base64,R0lGODlhAQABAAAAACw='
              alt=''
              width='1586'
              height='992'
              decoding='async'
              fetchPriority='high'
              className='h-full w-full object-cover object-[68%_center] select-none'
            />
          </picture>
          <div
            aria-hidden
            className='absolute inset-0 bg-gradient-to-t from-black/55 via-black/10 to-transparent'
          />

          <div className='relative space-y-7 p-10 pb-12 xl:p-16'>
            <div className='max-w-md space-y-4'>
              <h2 className='font-serif text-4xl font-semibold tracking-[-0.03em] text-[#faf9f5] xl:text-5xl'>
                {systemName}
              </h2>
              <p className='text-base leading-relaxed text-[#faf9f5]/65'>
                {t(
                  'A powerful, unified AI API management system for modern applications. Scale your business with confidence.'
                )}
              </p>
            </div>

            <div className='flex max-w-md items-center gap-8 border-t border-white/15 pt-6'>
              {statItems.map((stat) => (
                <div key={stat.label}>
                  <div className='font-mono text-2xl font-semibold text-[#faf9f5] tabular-nums'>
                    {stat.value}
                  </div>
                  <div className='mt-1 text-xs text-[#faf9f5]/55'>
                    {stat.label}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* The column is height-locked (h-svh page) and scrolls internally;
            my-auto on the inner block centers short forms but keeps tall
            forms reachable from the top — justify-center on an overflow
            container would clip the title off-screen instead. */}
        <div className='relative min-h-0'>
          <div className='absolute inset-x-0 top-0 z-10 flex items-center justify-between px-4 py-3 sm:px-6'>
            <SystemBrand variant='inline' />
            <div className='flex items-center gap-1'>
              <LanguageSwitcher />
              <ThemeSwitch />
            </div>
          </div>
          <div className='flex h-full flex-col overflow-y-auto px-4 pt-16 pb-8 sm:px-8'>
            <div
              aria-hidden
              className={`${dotGrid} [mask-image:radial-gradient(ellipse_60%_50%_at_50%_40%,black_30%,transparent_100%)] opacity-40`}
            />
            <div className='relative mx-auto my-auto flex w-full max-w-sm flex-col space-y-2'>
              {children}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
