/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import Anthropic from '@lobehub/icons/es/Anthropic/components/Mono'
import ChatGLM from '@lobehub/icons/es/ChatGLM/components/Mono'
import Cohere from '@lobehub/icons/es/Cohere/components/Mono'
import DeepSeek from '@lobehub/icons/es/DeepSeek/components/Mono'
import Gemini from '@lobehub/icons/es/Gemini/components/Mono'
import Google from '@lobehub/icons/es/Google/components/Mono'
import Kimi from '@lobehub/icons/es/Kimi/components/Mono'
import OpenAI from '@lobehub/icons/es/OpenAI/components/Mono'

const providerIcons = {
  DeepSeek,
  OpenAI,
  Anthropic,
  Google,
  Gemini,
  Kimi,
  GLM: ChatGLM,
  Cohere,
}

export type ProviderName = keyof typeof providerIcons

const railProviders: ProviderName[] = [
  'DeepSeek',
  'OpenAI',
  'Anthropic',
  'Google',
  'Kimi',
  'GLM',
]

export function ProviderMark(props: {
  name: ProviderName
  size?: number
  testId?: string
}) {
  const Icon = providerIcons[props.name]

  return (
    <span
      data-testid={props.testId}
      className='inline-flex items-center gap-2.5 whitespace-nowrap'
    >
      <Icon aria-hidden='true' size={props.size ?? 22} />
      <span>{props.name}</span>
    </span>
  )
}

export function ProviderLogoRail() {
  return (
    <div className='grid w-full grid-cols-2 sm:grid-cols-3 lg:grid-cols-6'>
      {railProviders.map((name) => (
        <div
          key={name}
          data-testid={`provider-logo-${name}`}
          className='landing-hover-lift text-foreground/75 border-border/70 hover:text-foreground flex min-h-16 items-center justify-center border-s-0 border-e border-b px-4 text-sm font-semibold last:border-e-0 hover:z-10 lg:border-b-0 sm:[&:nth-child(3n)]:border-e-0 lg:[&:nth-child(3n)]:border-e lg:[&:nth-child(6n)]:border-e-0'
        >
          <ProviderMark name={name} size={21} />
        </div>
      ))}
    </div>
  )
}
