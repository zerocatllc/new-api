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
import { useRef, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'

import { getHomeStats } from '../../api'

interface CounterProps {
  end: number
  suffix?: string
  prefix?: string
  duration?: number
  decimals?: number
}

function Counter(props: CounterProps) {
  const { end, suffix = '', prefix = '', duration = 1600, decimals = 0 } = props
  const ref = useRef<HTMLSpanElement>(null)
  const startedRef = useRef(false)

  const formatValue = useCallback(
    (v: number) =>
      decimals > 0 ? v.toFixed(decimals) : Math.round(v).toLocaleString(),
    [decimals]
  )

  const animate = useCallback(() => {
    const el = ref.current
    if (!el) return
    const start = performance.now()
    const step = (now: number) => {
      const progress = Math.min((now - start) / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 3)
      el.textContent = `${prefix}${formatValue(eased * end)}${suffix}`
      if (progress < 1) requestAnimationFrame(step)
    }
    requestAnimationFrame(step)
  }, [end, duration, prefix, suffix, formatValue])

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    if (mq.matches) {
      el.textContent = `${prefix}${formatValue(end)}${suffix}`
      return
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !startedRef.current) {
          startedRef.current = true
          animate()
          observer.unobserve(el)
        }
      },
      { threshold: 0.5 }
    )

    observer.observe(el)
    return () => observer.disconnect()
  }, [animate, end, prefix, suffix, formatValue])

  return (
    <span ref={ref} className='tabular-nums'>
      {prefix}0{suffix}
    </span>
  )
}

interface StatsProps {
  className?: string
}

interface StatItem {
  end: number
  suffix: string
  label: string
  decimals?: number
}

export function Stats(_props: StatsProps) {
  const { t } = useTranslation()

  // Counts are driven by live backend data (never hardcoded). While the query
  // is loading, placeholder zeros keep the layout stable; the counter animates
  // once real values arrive.
  const { data, isError } = useQuery({
    queryKey: ['home-stats'],
    queryFn: getHomeStats,
    staleTime: 5 * 60 * 1000,
  })
  // A failed stats fetch must not masquerade as real zeros.
  const unavailable = isError && !data

  const stats: StatItem[] = [
    { end: data?.models ?? 0, suffix: '+', label: t('AI Models') },
    { end: data?.providers ?? 0, suffix: '+', label: t('AI Providers') },
    {
      end: data?.uptimePct ?? 0,
      suffix: '%',
      label: t('Uptime SLA'),
      decimals: 1,
    },
  ]

  return (
    <div className='relative z-10'>
      <div className='w-full px-6 py-10 md:px-8 md:py-12'>
        <div className='grid grid-cols-3 gap-8 md:gap-12'>
          {stats.map((s) => (
            <div
              key={s.label}
              className='flex flex-col items-center text-center'
            >
              <span className='font-serif text-4xl font-normal tracking-tight md:text-5xl'>
                {unavailable ? (
                  <span aria-label={t('Unavailable')}>&mdash;</span>
                ) : (
                  <Counter
                    key={`${s.label}-${s.end}`}
                    end={s.end}
                    suffix={s.suffix}
                    decimals={s.decimals}
                  />
                )}
              </span>
              <span className='text-muted-foreground mt-1.5 text-xs'>
                {s.label}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
