/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import { useTranslation } from 'react-i18next'

import { LandingActions } from './landing-actions'
import { usePointerTilt } from './landing-motion'
import { ProviderMark, type ProviderName } from './provider-logos'
import { SignalMountainRelief } from './signal-mountain-relief'

type SignalLandingProps = { isAuthenticated: boolean }

function RoutingDiagram() {
  const { t } = useTranslation()
  const motion = usePointerTilt<HTMLDivElement>()
  const interfaces: Array<[ProviderName, string]> = [
    ['DeepSeek', '/v1/chat/completions'],
    ['OpenAI', '/v1/chat/completions'],
    ['Anthropic', '/v1/messages'],
    ['Google', '/v1beta/models/gemini:generateContent'],
    ['Kimi', '/v1/chat/completions'],
  ]

  return (
    <div
      ref={motion.ref}
      data-testid='signal-interactive-diagram'
      data-motion='pointer-tilt'
      aria-label={t('Compatible interfaces')}
      onPointerMove={motion.onPointerMove}
      onPointerLeave={motion.onPointerLeave}
      className='landing-motion-surface relative mx-auto min-h-[420px] w-full max-w-[760px]'
    >
      <div className='landing-motion-card relative min-h-[420px]'>
        <SignalMountainRelief />
        <svg
          data-testid='signal-routing-lines'
          aria-hidden='true'
          viewBox='0 0 760 420'
          fill='none'
          className='pointer-events-none absolute inset-0 hidden h-full w-full text-[#847e76] lg:block dark:text-white/35'
        >
          <defs>
            <marker
              id='signal-arrow-active'
              viewBox='0 0 8 8'
              refX='7'
              refY='4'
              markerWidth='6'
              markerHeight='6'
              orient='auto-start-reverse'
            >
              <path d='M0 0L8 4L0 8Z' fill='#ed5b20' />
            </marker>
            <marker
              id='signal-arrow-standby'
              viewBox='0 0 8 8'
              refX='7'
              refY='4'
              markerWidth='6'
              markerHeight='6'
              orient='auto-start-reverse'
            >
              <path d='M0 0L8 4L0 8Z' fill='currentColor' />
            </marker>
          </defs>
          <path
            d='M224 190C270 190 300 190 338 190'
            stroke='#ed5b20'
            strokeWidth='1.6'
            markerEnd='url(#signal-arrow-active)'
            className='landing-signal-flow landing-signal-flow--request'
          />
          <path
            d='M350 190C430 190 438 38 520 38'
            stroke='currentColor'
            markerEnd='url(#signal-arrow-standby)'
            className='landing-signal-flow'
          />
          <path
            d='M350 190C430 190 444 114 520 114'
            stroke='currentColor'
            markerEnd='url(#signal-arrow-standby)'
            className='landing-signal-flow'
          />
          <path
            d='M350 190C430 190 444 190 520 190'
            stroke='currentColor'
            markerEnd='url(#signal-arrow-standby)'
            className='landing-signal-flow'
          />
          <path
            d='M350 190C430 190 444 266 520 266'
            stroke='currentColor'
            markerEnd='url(#signal-arrow-standby)'
            className='landing-signal-flow'
          />
          <path
            d='M350 190C430 190 438 342 520 342'
            stroke='currentColor'
            markerEnd='url(#signal-arrow-standby)'
            className='landing-signal-flow'
          />
        </svg>
        <span
          data-testid='signal-motion-particle'
          aria-hidden='true'
          className='landing-signal-particle absolute top-[186px] left-[224px] hidden size-2 rounded-full bg-[#ed5b20] lg:block'
        />

        <span
          data-testid='signal-routing-junction'
          data-node-style='pulse'
          aria-hidden='true'
          className='landing-routing-node absolute top-[171px] left-[331px] hidden size-10 items-center justify-center rounded-full border border-[#ed5b20]/55 bg-[#fffdf9] shadow-[0_8px_28px_rgba(237,91,32,.16)] lg:flex dark:border-[#ed5b20]/45 dark:bg-[#1d1b18]'
        >
          <span
            aria-hidden='true'
            className='landing-routing-node-pulse absolute inset-[-9px] rounded-full border border-[#ed5b20]/30'
          />
          <span
            aria-hidden='true'
            className='size-4 rounded-full bg-[#ed5b20] shadow-[0_0_0_5px_rgba(237,91,32,.1),0_0_16px_rgba(237,91,32,.42)]'
          />
          <span className='sr-only'>{t('Load Balancing')}</span>
        </span>

        <div className='relative z-10 grid gap-5 pt-5 lg:block'>
          <div className='rounded-lg border border-[#cfc6ba] bg-[#fffdf9]/94 p-4 shadow-[0_12px_35px_rgba(91,58,35,.08)] backdrop-blur lg:absolute lg:top-[132px] lg:left-0 lg:w-[224px] lg:[transform:translateZ(64px)] dark:border-white/14 dark:bg-[#1d1b18]/94'>
            <p className='mb-3 text-[9px] font-semibold tracking-[0.16em] text-[#93401e] uppercase dark:text-[#ff9f74]'>
              {t('Request')}
            </p>
            <pre className='overflow-hidden font-mono text-[10px] leading-[1.65] text-[#45413c] dark:text-[#d8d2ca]'>{`POST /v1/chat/completions
{
  "model": "your-model",
  "messages": [...]
}`}</pre>
          </div>

          <div className='grid gap-2 sm:grid-cols-2 lg:absolute lg:top-0 lg:right-0 lg:w-[224px] lg:[transform:translateZ(64px)] lg:grid-cols-1 lg:gap-2.5'>
            {interfaces.map(([name, path]) => (
              <div
                key={name}
                data-route-state='available'
                className='landing-provider-card rounded-lg border border-[#cfc6ba] bg-[#fffdf9]/94 px-3.5 py-2.5 shadow-[0_8px_24px_rgba(91,58,35,.06)] backdrop-blur dark:border-white/12 dark:bg-[#1d1b18]/94'
              >
                <div className='flex items-center justify-between'>
                  <div className='text-foreground text-sm font-semibold'>
                    <ProviderMark
                      name={name}
                      size={19}
                      testId={`signal-provider-${name}`}
                    />
                  </div>
                  <span className='size-1.5 rounded-full bg-[#b9b3ac] dark:bg-white/25' />
                </div>
                <code className='text-muted-foreground mt-1 block truncate ps-[29px] text-[8px]'>
                  {path}
                </code>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

export function SignalLanding(props: SignalLandingProps) {
  const { t } = useTranslation()

  return (
    <section className='relative isolate overflow-hidden border-b border-[#d9d1c7] bg-[#fbfaf7] dark:border-white/10 dark:bg-[#171613]'>
      <div className='relative mx-auto grid min-h-[560px] max-w-[1440px] items-center gap-12 px-5 py-16 sm:px-8 lg:grid-cols-[0.78fr_1.22fr] lg:px-12 lg:py-16 xl:px-16'>
        <div className='max-w-xl'>
          <h1 className='landing-reveal text-foreground font-serif text-5xl leading-[0.98] font-medium tracking-[-0.045em] text-balance [animation-delay:80ms] sm:text-6xl xl:text-7xl'>
            {t('Models change. Your API stays the same.')}
          </h1>
          <p className='landing-reveal text-muted-foreground mt-7 max-w-xl text-base leading-7 text-pretty [animation-delay:160ms] sm:text-lg'>
            {t(
              'Connect leading models through one API, switch providers when needed, and manage routing, failover, and usage in one place.'
            )}
          </p>
          <div className='landing-reveal mt-9 [animation-delay:240ms]'>
            <LandingActions isAuthenticated={props.isAuthenticated} />
          </div>
        </div>
        <RoutingDiagram />
      </div>
    </section>
  )
}
