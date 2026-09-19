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
import { ChevronLeft, ChevronRight, Image as ImageIcon } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

import type { HeroSlide } from '../../hooks/use-home-sections'

const AUTOPLAY_MS = 6000

interface HeroSlideshowProps {
  slides: HeroSlide[]
  className?: string
}

function HeroMedia({ slide }: { slide: HeroSlide }) {
  if (slide.video) {
    return (
      <video
        key={slide.id}
        src={slide.video}
        className='absolute inset-0 size-full object-cover'
        autoPlay
        muted
        loop
        playsInline
      />
    )
  }

  if (slide.image) {
    return (
      <img
        key={slide.id}
        src={slide.image}
        alt={slide.title}
        className='absolute inset-0 size-full object-cover'
      />
    )
  }

  return (
    <div className='from-muted to-background absolute inset-0 bg-gradient-to-br' />
  )
}

function HeroThumbnail({ slide }: { slide: HeroSlide }) {
  if (slide.video) {
    return (
      <video
        src={slide.video}
        className='size-full object-cover'
        muted
        playsInline
        preload='metadata'
      />
    )
  }

  if (slide.image) {
    return <img src={slide.image} alt='' className='size-full object-cover' />
  }

  return (
    <span className='from-brand/30 to-brand/10 text-brand flex size-full items-center justify-center bg-gradient-to-br'>
      <ImageIcon className='size-5' />
    </span>
  )
}

/**
 * Hero promo carousel ("宣传图") driven by `status.homepage_slideshow`.
 * Structure is a 1:1 reconstruction of the rixapi reference hero: a
 * min-h-[540px] media stage (brand wash + glow + media + bottom-up dark
 * overlay) with a vertically-centered caption (h1 / description / CTA) and
 * side arrows, followed by a banner-card selector row.
 */
export function HeroSlideshow({ slides, className }: HeroSlideshowProps) {
  const [active, setActive] = useState(0)
  const count = slides.length

  const go = useCallback(
    (next: number) => setActive((next + count) % count),
    [count]
  )

  useEffect(() => {
    if (count <= 1) return
    const timer = setInterval(() => {
      setActive((prev) => (prev + 1) % count)
    }, AUTOPLAY_MS)
    return () => clearInterval(timer)
  }, [count])

  if (count === 0) return null

  const slide = slides[Math.min(active, count - 1)]
  if (!slide) return null

  return (
    // pt-16 offsets the fixed h-16 header so the hero stage sits below it
    // (the reference header is sticky and reserves this space in flow; here
    // the header is fixed, so the slideshow hero must reserve it itself).
    <div className={cn('relative pt-16', className)}>
      <section className='relative min-h-[460px] overflow-hidden md:min-h-[540px]'>
        {/* Brand-tinted wash + glow */}
        <div
          aria-hidden
          className='from-brand/8 absolute inset-0 bg-gradient-to-b via-transparent to-transparent'
        />
        <div
          aria-hidden
          className='bg-brand/10 absolute top-0 left-1/2 h-[500px] w-[900px] -translate-x-1/2 rounded-full blur-3xl'
        />

        {/* Media */}
        <HeroMedia slide={slide} />

        {/* Legibility overlay: dark at the bottom, transparent at the top. */}
        <div className='absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent transition-opacity duration-700' />

        {/* Vertically-centered caption */}
        <div className='relative mx-auto flex min-h-[460px] max-w-5xl flex-col items-center justify-center px-4 pb-8 text-center md:min-h-[540px]'>
          {slide.title && (
            <h1 className='mb-4 text-4xl leading-[1.1] font-bold tracking-tight text-white drop-shadow-lg sm:text-5xl md:text-6xl'>
              {slide.title}
            </h1>
          )}
          {slide.description && (
            <p className='mb-8 max-w-2xl text-lg leading-relaxed text-white/85 drop-shadow md:text-xl'>
              {slide.description}
            </p>
          )}
          {slide.buttonLabel && slide.buttonUrl && (
            <Button
              className='h-12 rounded-md px-8 text-base font-semibold shadow-lg'
              render={<a href={slide.buttonUrl} />}
            >
              {slide.buttonLabel}
            </Button>
          )}
        </div>

        {/* Side arrows */}
        {count > 1 && (
          <>
            <button
              type='button'
              aria-label='Previous slide'
              onClick={() => go(active - 1)}
              className='absolute top-1/2 left-4 flex size-10 -translate-y-1/2 items-center justify-center rounded-full border border-white/15 bg-black/20 text-white backdrop-blur-sm transition-colors hover:bg-black/40'
            >
              <ChevronLeft className='size-6' />
            </button>
            <button
              type='button'
              aria-label='Next slide'
              onClick={() => go(active + 1)}
              className='absolute top-1/2 right-4 flex size-10 -translate-y-1/2 items-center justify-center rounded-full border border-white/15 bg-black/20 text-white backdrop-blur-sm transition-colors hover:bg-black/40'
            >
              <ChevronRight className='size-6' />
            </button>
          </>
        )}
      </section>

      {/* Banner-card selector row: full-width bar (border-t, justify-center)
          holding an inner max-w-3xl flex row of equal-width (flex-1) cards. */}
      {count > 1 && (
        <div className='border-border/40 bg-background flex justify-center gap-3 border-t px-6 py-3'>
          <div className='flex w-full max-w-3xl gap-2'>
            {slides.map((s, index) => (
              <button
                key={s.id}
                type='button'
                aria-label={s.title || `Slide ${index + 1}`}
                aria-current={index === active ? 'true' : undefined}
                onClick={() => setActive(index)}
                className={cn(
                  'group flex min-w-0 flex-1 items-center gap-2 rounded-lg border px-2.5 py-1.5 text-left transition-all duration-200',
                  index === active
                    ? 'border-brand/60 bg-brand/5'
                    : 'border-border/40 hover:border-border hover:bg-accent/50'
                )}
              >
                <span className='border-border/30 bg-muted relative size-9 shrink-0 overflow-hidden rounded-md border'>
                  <HeroThumbnail slide={s} />
                </span>
                <span className='text-foreground min-w-0 flex-1 truncate text-sm font-medium'>
                  {s.title}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
