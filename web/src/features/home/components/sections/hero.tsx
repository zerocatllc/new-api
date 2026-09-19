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
import { ArrowRight, ChevronRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'

import { HeroShowcase } from './hero-showcase'

interface HeroProps {
  className?: string
  isAuthenticated?: boolean
}

/**
 * Left-aligned editorial hero (Kimi-style): a filled pill badge, an oversized
 * serif marketing headline (weight 600, two lines), a muted subtitle and a
 * primary button paired with a secondary text link — all confined to a
 * width-capped column over a dotted-grid wash. On large screens a static,
 * low-contrast product-UI showcase (<HeroShowcase />) sits in the right
 * column so the hero isn't pure whitespace, mirroring the reference's
 * dimmed console perspective; it's hidden below `lg` so it never competes
 * with the copy on small screens. The stats row is rendered by the sibling
 * <WhyChooseUs /> section.
 */
export function Hero(props: HeroProps) {
  const { t } = useTranslation()

  return (
    <section className='relative z-10 flex min-h-[min(52rem,calc(100svh-4rem))] items-end overflow-hidden pt-24 pb-20 md:pb-28'>
      {/* Soft ink radial wash */}
      <div
        aria-hidden
        className='pointer-events-none absolute inset-0 -z-10'
        style={{
          background:
            'radial-gradient(ellipse 55% 55% at 0% 0%, var(--brand) 0%, transparent 60%)',
          opacity: 0.05,
        }}
      />
      {/* Dotted grid pattern */}
      <div
        aria-hidden
        className='pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(var(--border)_1px,transparent_1px)] [mask-image:radial-gradient(ellipse_60%_60%_at_12%_25%,black_0%,transparent_72%)] bg-[size:26px_26px] opacity-50'
      />

      <div className='mx-auto grid w-full max-w-[1440px] grid-cols-1 items-center gap-12 px-6 md:px-8 lg:grid-cols-2 lg:gap-16'>
        <div className='flex max-w-2xl flex-col items-start text-left'>
          {/* Filled pill badge (trailing chevron) */}
          <div className='bg-secondary text-secondary-foreground inline-flex items-center gap-1.5 rounded-full py-1.5 pr-2 pl-3.5 text-sm font-medium'>
            <span>{t('The open platform for large models')}</span>
            <ChevronRight className='text-muted-foreground/50 size-4' />
          </div>

          {/* Serif marketing headline with deliberate display emphasis */}
          <h1 className='text-foreground mt-6 max-w-[16ch] font-serif text-[clamp(2.6rem,6vw,4.5rem)] leading-[1.08] font-semibold tracking-[-0.015em] text-balance whitespace-pre-line'>
            {t('Models as a service. Innovate faster.')}
          </h1>

          {/* Subtitle */}
          <p className='text-muted-foreground mt-6 max-w-[42ch] text-lg leading-relaxed'>
            {t(
              'Keys, billing, routing, failover — we take care of the plumbing, so the best models in the world are always on tap.'
            )}
          </p>

          {/* Actions: primary pill button + secondary text link */}
          <div className='mt-12 flex flex-wrap items-center gap-6 md:mt-14'>
            {props.isAuthenticated ? (
              <Button
                className='group h-11 rounded-lg px-6 text-sm font-semibold'
                render={<Link to='/dashboard' />}
              >
                {t('Go to Dashboard')}
                <ArrowRight className='ml-1.5 size-4 transition-transform duration-200 group-hover:translate-x-0.5' />
              </Button>
            ) : (
              <Button
                className='group h-11 rounded-lg px-6 text-sm font-semibold'
                render={<Link to='/sign-up' />}
              >
                {t('Get Started')}
                <ArrowRight className='ml-1.5 size-4 transition-transform duration-200 group-hover:translate-x-0.5' />
              </Button>
            )}
            <Link
              to='/pricing'
              className='text-foreground hover:text-muted-foreground group inline-flex items-center gap-1 text-sm font-semibold'
            >
              {t('Browse Models')}
              <ChevronRight className='size-4 transition-transform duration-200 group-hover:translate-x-0.5' />
            </Link>
          </div>
        </div>

        <HeroShowcase />
      </div>
    </section>
  )
}
