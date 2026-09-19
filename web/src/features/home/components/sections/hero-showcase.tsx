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
import { TrendingUp } from 'lucide-react'
import { useTranslation } from 'react-i18next'

// Relative bar heights for the usage card's mini bar chart — purely
// decorative, no real data. The last bar is the "current" one (bg-brand),
// the rest are dimmed (bg-brand/30).
const USAGE_BARS = [40, 60, 45, 70, 55, 90, 65, 100]

/**
 * Static product-UI perspective showcase for the hero's right column (Kimi
 * reference): a tilted, low-contrast stack of three hairline cards — a mini
 * playground panel (model + parameters + a request/response sketch) as the
 * front card, with a usage-stat card and a latency card peeking out behind
 * it. Purely decorative and non-interactive; every label reuses an existing
 * i18n key, and the response body is rendered as skeleton bars rather than
 * fabricated chat copy. Hidden below `lg` so it never competes with the hero
 * copy on small screens.
 */
export function HeroShowcase() {
  const { t } = useTranslation()

  return (
    <div
      aria-hidden
      className='hidden items-center justify-center opacity-80 lg:flex'
    >
      <div className='relative [transform:perspective(1200px)_rotateX(8deg)_rotateY(-12deg)]'>
        {/* Back card: usage stat + mini bar chart, peeking out top-right */}
        <div className='border-border bg-card absolute -top-10 -right-40 w-44 rounded-xl border p-4'>
          <div className='text-muted-foreground text-xs'>
            {t('API Requests')}
          </div>
          <div className='text-foreground mt-1 flex items-center gap-1.5 font-mono text-2xl font-semibold tabular-nums'>
            128,402
            <TrendingUp className='text-brand size-4' />
          </div>
          <div className='mt-3 flex h-8 items-end gap-1'>
            {USAGE_BARS.map((height, i) => (
              <span
                key={height}
                className={
                  i === USAGE_BARS.length - 1
                    ? 'bg-brand w-full rounded-sm'
                    : 'bg-brand/30 w-full rounded-sm'
                }
                style={{ height: `${height}%` }}
              />
            ))}
          </div>
        </div>

        {/* Back card: latency, peeking out bottom-left */}
        <div className='border-border bg-card absolute -bottom-8 -left-10 z-10 w-32 rounded-xl border p-3'>
          <div className='text-muted-foreground text-xs'>
            {t('Latency short')}
          </div>
          <div className='text-foreground mt-1 font-mono text-lg font-semibold tabular-nums'>
            142ms
          </div>
        </div>

        {/* Front card: mini playground panel */}
        <div className='border-border bg-card relative w-80 rounded-xl border p-5'>
          <div className='flex items-center justify-between'>
            <span className='text-muted-foreground text-xs font-medium tracking-wide uppercase'>
              {t('Playground')}
            </span>
            <span className='bg-brand size-1.5 rounded-full' />
          </div>
          <div className='text-foreground mt-3 font-mono text-sm font-semibold'>
            claude-sonnet-5
          </div>

          <div className='divide-border border-border mt-4 divide-y border-t'>
            <div className='flex items-center justify-between py-2 text-xs'>
              <span className='text-muted-foreground'>{t('Temperature')}</span>
              <span className='text-foreground font-mono tabular-nums'>
                0.7
              </span>
            </div>
            <div className='flex items-center justify-between py-2 text-xs'>
              <span className='text-muted-foreground'>{t('Top P')}</span>
              <span className='text-foreground font-mono tabular-nums'>
                1.0
              </span>
            </div>
            <div className='flex items-center justify-between py-2 text-xs'>
              <span className='text-muted-foreground'>{t('Max Tokens')}</span>
              <span className='text-foreground font-mono tabular-nums'>
                4096
              </span>
            </div>
            <div className='flex items-center justify-between py-2 text-xs'>
              <span className='text-muted-foreground'>{t('Stream')}</span>
              <span className='text-foreground font-mono tabular-nums'>on</span>
            </div>
          </div>

          {/* Request summary — literal UI data, not marketing copy */}
          <div className='mt-4 flex items-center justify-between'>
            <span className='text-muted-foreground font-mono text-[11px]'>
              POST /v1/chat/completions
            </span>
            <span className='flex items-center gap-1'>
              <span className='bg-success size-1.5 rounded-full' />
              <span className='text-success font-mono text-[11px] font-medium'>
                200
              </span>
            </span>
          </div>

          {/* Skeleton response — no fabricated chat copy */}
          <div className='border-border bg-muted/40 mt-2 space-y-2 rounded-lg border p-3'>
            <div className='bg-muted-foreground/25 h-2 w-full rounded-full' />
            <div className='bg-muted-foreground/25 h-2 w-4/5 rounded-full' />
            <div className='bg-muted-foreground/25 h-2 w-3/5 rounded-full' />
          </div>
        </div>
      </div>
    </div>
  )
}
