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
import { BarChart3, Boxes, GitBranch, Globe } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { getHomeStats } from '../../api'

// Monochrome icon treatment matching landing-test `.feat .ic`: ink glyph on a
// muted panel with a hairline border. No per-feature color — the editorial
// look keeps every feature card neutral, color reserved for semantic states.
const FEATURES = [
  {
    icon: Boxes,
    title: 'One Account, Every Top AI Model',
    desc: 'No more juggling accounts, keys, and protocols. One account and one API connect you directly to every leading model — straight from official providers or licensed cloud partners. No proxies, no degraded copies. Fully compatible with the OpenAI, Anthropic, and Google Vertex AI protocols.',
  },
  {
    icon: BarChart3,
    title: 'Full Visibility Into Every Token and Cost',
    desc: 'Every request, token, and charge is clearly traceable. Multi-dimensional dashboards deliver the insight to optimize cost and make smarter decisions.',
  },
  {
    icon: GitBranch,
    title: 'Multi-Provider Failover, Zero Downtime',
    desc: 'Every model is backed by multiple provider channels and ample reserves. When one provider hits a rate limit, outage, or regional issue, traffic switches to a backup channel automatically — your app stays up.',
  },
  {
    icon: Globe,
    title: 'Global Edge Acceleration',
    desc: 'Backed by the Cloudflare global edge network, requests are served from the nearest node — cutting latency for a consistently fast experience worldwide.',
  },
]

export function WhyChooseUs() {
  const { t } = useTranslation()
  const { data, isError } = useQuery({
    queryKey: ['home-stats'],
    queryFn: getHomeStats,
    staleTime: 5 * 60 * 1000,
  })
  // A failed stats fetch must not masquerade as real zeros.
  const unavailable = isError && !data

  const stats = [
    {
      value: unavailable ? '—' : `${data?.models ?? 0}+`,
      label: t('AI Models'),
    },
    {
      value: unavailable ? '—' : `${(data?.uptimePct ?? 0).toFixed(1)}%`,
      label: t('Uptime SLA'),
    },
    {
      value: unavailable ? '—' : `${data?.providers ?? 0}+`,
      label: t('AI Providers'),
    },
    { value: '24/7', label: t('Expert Support') },
  ]

  return (
    <section>
      <div className='mx-auto w-full max-w-[1440px] px-6 py-16 md:px-8 md:py-24'>
        <div className='text-muted-foreground mb-2 text-xs font-semibold tracking-widest uppercase'>
          {t('Core Advantages')}
        </div>
        <h2 className='text-2xl font-bold tracking-tight md:text-3xl'>
          {t('Why Choose Us')}
        </h2>
        <p className='text-muted-foreground mt-2 max-w-2xl text-sm md:text-base'>
          {t(
            'Reliable, high-performance AI infrastructure for developers and enterprises — build, deploy, and scale AI apps faster.'
          )}
        </p>

        {/* Horizontal stat band — hairline-divided, mono figures (folds the
            former standalone <Stats /> band into this section). */}
        <div className='border-border divide-border mt-10 grid grid-cols-2 divide-x divide-y border sm:grid-cols-4 sm:divide-y-0'>
          {stats.map((s) => (
            <div key={s.label} className='px-6 py-6 text-center'>
              <div className='text-foreground font-mono text-3xl font-semibold tracking-tight md:text-4xl'>
                {s.value}
              </div>
              <div className='text-muted-foreground mt-1 text-xs'>
                {s.label}
              </div>
            </div>
          ))}
        </div>

        {/* Scenario cards: decorative canvas-dot head + centered icon, no
            shadow — hairline border carries the surface step. */}
        <div className='mt-12 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4'>
          {FEATURES.map((f) => {
            const Icon = f.icon
            return (
              <div
                key={f.title}
                className='border-border overflow-hidden rounded-xl border'
              >
                <div className='bg-secondary flex h-24 items-center justify-center bg-[radial-gradient(var(--canvas-dot)_1.5px,transparent_1.5px)] bg-[size:16px_16px]'>
                  <Icon className='text-foreground size-8' strokeWidth={1.5} />
                </div>
                <div className='p-5'>
                  <h3 className='text-foreground text-base font-semibold'>
                    {t(f.title)}
                  </h3>
                  <p className='text-muted-foreground mt-2 text-sm leading-relaxed'>
                    {t(f.desc)}
                  </p>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
