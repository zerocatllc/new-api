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
import {
  ArrowUpRight,
  KeyRound,
  MessageSquare,
  Terminal,
  UserPlus,
  type LucideIcon,
} from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { AnimateInView } from '@/components/animate-in-view'

interface CodeShowcaseProps {
  isAuthenticated?: boolean
}

interface OnboardingStep {
  icon: LucideIcon
  titleKey: string
  descKey: string
}

const STEPS: OnboardingStep[] = [
  {
    icon: UserPlus,
    titleKey: 'Sign up and top up',
    descKey:
      'Create an account, top up your balance — pay as you go with no minimum.',
  },
  {
    icon: KeyRound,
    titleKey: 'Create an API key',
    descKey: 'Generate your own API key in the console with one click.',
  },
  {
    icon: Terminal,
    titleKey: 'Point base_url to us',
    descKey: 'Swap the base URL, keep your code — switch models any time.',
  },
]

const ENTRY_CARDS: OnboardingStep[] = [
  {
    icon: Terminal,
    titleKey: 'IDE & Agent Guide',
    descKey: 'Use it in IDEs and coding agents.',
  },
  {
    icon: MessageSquare,
    titleKey: 'App Guide',
    descKey: 'Use it in chat clients and apps.',
  },
]

interface Protocol {
  // Protocol names are proper nouns — rendered verbatim, never translated.
  label: string
  path: string
  request: string
  response: string
}

// Per-protocol request/response samples mirror the four native endpoint
// shapes the gateway exposes (gpt.ge reference): OpenAI Chat Completions,
// OpenAI Responses, Anthropic Messages and Gemini generateContent.
const PROTOCOLS: Protocol[] = [
  {
    label: 'Chat',
    path: '/v1/chat/completions',
    request: `curl -X POST "https://api.zero.cat/v1/chat/completions" \\
  -H "Authorization: Bearer sk-••••" \\
  -d '{
    "model": "model-name",
    "messages": [
      { "role": "user", "content": "your prompts" }
    ]
  }'`,
    response: `{
  "choices": [
    { "message": { "role": "assistant", "content": "..." } }
  ],
  "usage": { "total_tokens": 15 }
}`,
  },
  {
    label: 'Responses',
    path: '/v1/responses',
    request: `curl -X POST "https://api.zero.cat/v1/responses" \\
  -H "Authorization: Bearer sk-••••" \\
  -d '{
    "model": "model-name",
    "input": "your prompts"
  }'`,
    response: `{
  "output": [{ "type": "output_text", "text": "..." }],
  "usage": { "input_tokens": 2, "output_tokens": 15 }
}`,
  },
  {
    label: 'Claude',
    path: '/v1/messages',
    request: `curl -X POST "https://api.zero.cat/v1/messages" \\
  -H "x-api-key: sk-••••" \\
  -H "anthropic-version: 2023-06-01" \\
  -d '{
    "model": "model-name",
    "max_tokens": 1024,
    "messages": [
      { "role": "user", "content": "your prompts" }
    ]
  }'`,
    response: `{
  "content": [{ "type": "text", "text": "..." }],
  "usage": { "input_tokens": 2, "output_tokens": 13 }
}`,
  },
  {
    label: 'Gemini',
    path: '/v1beta/models/{model}:generateContent',
    request: `curl -X POST \\
  "https://api.zero.cat/v1beta/models/{model}:generateContent" \\
  -H "x-goog-api-key: sk-••••" \\
  -d '{
    "contents": [
      { "parts": [{ "text": "your prompts" }] }
    ]
  }'`,
    response: `{
  "candidates": [
    { "content": { "parts": [{ "text": "..." }] } }
  ],
  "usageMetadata": { "totalTokenCount": 24 }
}`,
  },
]

// Minimal syntax layering without a highlighter library: quoted strings
// followed by a colon are keys (foreground), other quoted strings and bare
// numbers are values (primary), everything else stays muted. Tokens carry
// their character offset so each span gets a stable, unique key.
interface CodeToken {
  text: string
  cls: string
  start: number
}

function tokenizeCode(code: string): CodeToken[] {
  const tokens: CodeToken[] = []
  const re = /("[^"]*")|(\b\d+(?:\.\d+)?\b)/g
  let last = 0
  for (let m = re.exec(code); m !== null; m = re.exec(code)) {
    if (m.index > last) {
      tokens.push({
        text: code.slice(last, m.index),
        cls: 'text-muted-foreground',
        start: last,
      })
    }
    if (m[1]) {
      const isKey = /^\s*:/.test(code.slice(m.index + m[1].length))
      tokens.push({
        text: m[1],
        cls: isKey ? 'text-foreground' : 'text-brand',
        start: m.index,
      })
    } else {
      tokens.push({ text: m[2], cls: 'text-brand', start: m.index })
    }
    last = m.index + m[0].length
  }
  if (last < code.length) {
    tokens.push({
      text: code.slice(last),
      cls: 'text-muted-foreground',
      start: last,
    })
  }
  return tokens
}

function renderCode(code: string) {
  return tokenizeCode(code).map((token) => (
    <span key={token.start} className={token.cls}>
      {token.text}
    </span>
  ))
}

/**
 * "3 Lines of Code. Every Model." section, rebuilt as a two-column onboarding
 * block (gpt.ge reference): three numbered steps + two doc entry cards on the
 * left, a static request/response code window on the right. Replaces the old
 * animated <HeroTerminalDemo>, whose accent colors leaned on a non-semantic
 * rainbow palette (emerald/amber/blue/violet) — this window only layers
 * text-brand over text-muted-foreground/text-foreground.
 */
export function CodeShowcase(props: CodeShowcaseProps) {
  const { t } = useTranslation()
  const entryHref = props.isAuthenticated ? '/dashboard' : '/sign-up'
  const [active, setActive] = useState(0)
  const protocol = PROTOCOLS[active]

  return (
    <section className='border-border/40 bg-muted/10 border-t'>
      <div className='mx-auto grid w-full max-w-[1440px] grid-cols-1 gap-10 px-6 py-16 md:px-8 md:py-24 lg:grid-cols-2 lg:gap-12'>
        {/* Left: onboarding steps + doc entry cards */}
        <div>
          <h2 className='text-2xl leading-tight font-bold tracking-tight md:text-4xl'>
            {t('3 Lines of Code. Every Model.')}
          </h2>
          <p className='text-muted-foreground mt-4 max-w-md text-sm leading-relaxed md:text-base'>
            {t(
              'Fully compatible with the OpenAI SDK. Just point base_url to us — no other changes needed.'
            )}
          </p>

          <div className='mt-8 space-y-4'>
            {STEPS.map((step, i) => (
              <AnimateInView
                key={step.titleKey}
                delay={i * 100}
                animation='fade-up'
                className='border-border bg-card flex items-start gap-4 rounded-xl border p-5'
              >
                <span className='bg-foreground text-background flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold'>
                  {i + 1}
                </span>
                <div className='min-w-0'>
                  <h3 className='text-foreground text-sm font-semibold'>
                    {t(step.titleKey)}
                  </h3>
                  <p className='text-muted-foreground mt-1 text-sm leading-relaxed'>
                    {t(step.descKey)}
                  </p>
                </div>
              </AnimateInView>
            ))}
          </div>

          <div className='mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2'>
            {ENTRY_CARDS.map((card) => {
              const Icon = card.icon
              return (
                <Link
                  key={card.titleKey}
                  to={entryHref}
                  className='border-border bg-card hover:border-foreground/20 group relative flex flex-col gap-2 rounded-xl border p-5 transition-colors'
                >
                  <ArrowUpRight className='text-muted-foreground group-hover:text-foreground absolute top-4 right-4 size-4 transition-colors' />
                  <Icon className='text-foreground size-5' strokeWidth={1.5} />
                  <h3 className='text-foreground text-sm font-semibold'>
                    {t(card.titleKey)}
                  </h3>
                  <p className='text-muted-foreground text-xs leading-relaxed'>
                    {t(card.descKey)}
                  </p>
                </Link>
              )
            })}
          </div>
        </div>

        {/* Right: request/response code window with protocol tabs */}
        <div className='border-border bg-card overflow-hidden rounded-xl border lg:self-center'>
          {/* Window chrome + protocol tab strip */}
          <div className='border-border flex items-center gap-3 border-b px-4 py-3'>
            <div className='flex items-center gap-1.5'>
              <span className='bg-muted-foreground/25 size-2.5 rounded-full' />
              <span className='bg-muted-foreground/25 size-2.5 rounded-full' />
              <span className='bg-muted-foreground/25 size-2.5 rounded-full' />
            </div>
            <div role='tablist' className='ml-2 flex items-center gap-1'>
              {PROTOCOLS.map((p, i) => (
                <button
                  key={p.label}
                  type='button'
                  role='tab'
                  aria-selected={i === active}
                  onClick={() => setActive(i)}
                  className={
                    i === active
                      ? 'bg-primary text-primary-foreground cursor-pointer rounded-full px-2.5 py-1 text-xs font-medium'
                      : 'text-muted-foreground hover:text-foreground cursor-pointer rounded-full px-2.5 py-1 text-xs font-medium transition-colors'
                  }
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Request */}
          <div className='px-5 py-4'>
            <span className='text-muted-foreground text-[10px] font-semibold tracking-[0.18em] uppercase'>
              {t('Request')}
            </span>
            <pre className='mt-2 overflow-x-auto font-mono text-[12.5px] leading-[1.7] whitespace-pre-wrap'>
              {renderCode(protocol.request)}
            </pre>
          </div>

          <div className='border-border border-t' />

          {/* Response */}
          <div className='bg-muted/20 px-5 py-4'>
            <span className='text-muted-foreground text-[10px] font-semibold tracking-[0.18em] uppercase'>
              {t('Response')}
            </span>
            <pre className='mt-2 overflow-x-auto font-mono text-[12.5px] leading-[1.7]'>
              {renderCode(protocol.response)}
            </pre>
          </div>

          {/* Status row */}
          <div className='border-border bg-muted/30 flex items-center justify-between gap-4 border-t px-5 py-2.5'>
            <span className='text-muted-foreground truncate font-mono text-[10px] tracking-wider'>
              POST {protocol.path}
            </span>
            <span className='flex shrink-0 items-center gap-1.5'>
              <span className='bg-success size-1.5 rounded-full' />
              <span className='text-success font-mono text-[10px] font-medium tracking-wider uppercase'>
                200 ok
              </span>
            </span>
          </div>
        </div>
      </div>
    </section>
  )
}
