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
import { render, screen } from '@testing-library/react'
import type { ComponentProps, PropsWithChildren } from 'react'
import { afterEach, expect, test, vi } from 'vitest'

import { Home } from '..'

const authState = vi.hoisted(() => ({ user: null as object | null }))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, ...props }: ComponentProps<'a'> & { to: string }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}))

vi.mock('@/components/layout', () => ({
  PublicLayout: ({ children }: PropsWithChildren) => children,
}))

vi.mock('@/components/layout/components/footer', () => ({
  Footer: () => <footer>Footer</footer>,
}))

vi.mock('@/components/loading-state', () => ({
  LoadingState: () => <div>Loading</div>,
}))

vi.mock('@/components/ui/markdown', () => ({
  Markdown: ({ children }: PropsWithChildren) => children,
}))

vi.mock('@/hooks/use-system-config', () => ({
  useSystemConfig: () => ({
    systemName: 'zero.cat',
    logo: '/logo.png',
  }),
}))

vi.mock('@/stores/auth-store', () => ({
  useAuthStore: () => ({ auth: { user: authState.user } }),
}))

vi.mock('../components', () => ({
  AnnouncementBanner: () => null,
  CodeShowcase: () => <section>3 Lines of Code. Every Model.</section>,
  Hero: () => null,
  ProviderMarquee: () => (
    <section>Bringing together the world's leading AI providers</section>
  ),
  WhyChooseUs: () => <section>Why Choose Us</section>,
}))

vi.mock('../hooks', () => ({
  useHomePageContent: () => ({
    content: '',
    isLoaded: true,
    isUrl: false,
  }),
}))

vi.mock('../hooks/use-home-sections', () => ({
  useHomeSections: () => ({ banner: null }),
}))

afterEach(() => {
  authState.user = null
  window.history.replaceState({}, '', '/')
})

test('renders the signal landing as the only homepage', () => {
  render(<Home />)

  expect(
    screen.getByRole('heading', {
      level: 1,
      name: 'Models change. Your API stays the same.',
    })
  ).toBeInTheDocument()
  expect(screen.getByRole('main')).toHaveAttribute(
    'data-landing-variant',
    'signal'
  )
  expect(screen.getByTestId('signal-routing-junction')).toHaveAttribute(
    'data-node-style',
    'pulse'
  )
  expect(
    screen.queryByTestId('signal-routing-hub-logo')
  ).not.toBeInTheDocument()
  expect(screen.queryByTestId('signal-background-art')).not.toBeInTheDocument()
  expect(
    screen.queryByTestId('signal-editorial-wordmark')
  ).not.toBeInTheDocument()
  expect(screen.queryByTestId('landing-film-grain')).not.toBeInTheDocument()
  expect(screen.getAllByRole('button', { name: 'Get Started' })).toHaveLength(1)
  for (const button of screen.getAllByRole('button', { name: 'Get Started' })) {
    expect(button).toHaveAttribute('href', '/sign-up')
  }

  expect(screen.getByTestId('signal-interactive-diagram')).toHaveAttribute(
    'data-motion',
    'pointer-tilt'
  )
  const mountain = screen.getByTestId('signal-mountain-relief')
  expect(mountain).toHaveAttribute('data-rendering', 'photographic-relief')
  expect(mountain).toHaveAttribute('src', '/landing-mountain-relief.webp')
  expect(mountain).toHaveAttribute('alt', '')
  expect(mountain.querySelector('[data-mountain-face]')).not.toBeInTheDocument()
  expect(screen.getByTestId('signal-provider-OpenAI')).toBeInTheDocument()
  expect(screen.getByTestId('signal-provider-Anthropic')).toBeInTheDocument()
  expect(screen.getByTestId('signal-provider-DeepSeek')).toBeInTheDocument()
  expect(screen.queryByText('R1')).not.toBeInTheDocument()
  expect(screen.queryByText('AI API gateway')).not.toBeInTheDocument()
  expect(screen.getByTestId('signal-provider-Google')).toBeInTheDocument()
  expect(screen.getByTestId('signal-provider-Kimi')).toBeInTheDocument()
  expect(screen.queryByTestId('signal-provider-Meta')).not.toBeInTheDocument()
  expect(screen.getByText('/v1/messages')).toBeInTheDocument()

  const routingLines = screen.getByTestId('signal-routing-lines')
  expect(routingLines).toHaveAttribute('fill', 'none')
  expect(routingLines.querySelectorAll('.landing-signal-flow')).toHaveLength(6)
  expect(
    routingLines.querySelector('.landing-signal-flow--active')
  ).not.toBeInTheDocument()
  expect(
    screen
      .getByTestId('signal-provider-DeepSeek')
      ?.closest('[data-route-state]')
  ).toHaveAttribute('data-route-state', 'available')
  expect(screen.getByTestId('signal-motion-particle')).toBeInTheDocument()
  expect(
    screen.getByText("Bringing together the world's leading AI providers")
  ).toBeInTheDocument()
  expect(
    screen.queryByText('Continuously adding the latest AI models')
  ).not.toBeInTheDocument()
  expect(screen.getByText('Why Choose Us')).toBeInTheDocument()
  expect(screen.getByText('3 Lines of Code. Every Model.')).toBeInTheDocument()
  expect(
    screen.queryByRole('heading', { level: 2, name: 'Control every request.' })
  ).not.toBeInTheDocument()
  expect(
    screen.queryByRole('heading', { level: 2, name: 'Integrate in minutes.' })
  ).not.toBeInTheDocument()
  expect(
    screen.queryByRole('heading', {
      level: 2,
      name: 'Start building on one gateway.',
    })
  ).not.toBeInTheDocument()
})

test('does not expose the removed landing variants through the query string', () => {
  window.history.replaceState({}, '', '/?landing=glacier')

  render(<Home />)

  expect(screen.getByRole('main')).toHaveAttribute(
    'data-landing-variant',
    'signal'
  )
  expect(screen.getByTestId('signal-routing-junction')).toBeInTheDocument()
  expect(
    screen.queryByTestId('glacier-dashboard-shell')
  ).not.toBeInTheDocument()
})

test('routes the primary action to the dashboard for an authenticated user', () => {
  authState.user = { id: 1 }

  render(<Home />)

  expect(
    screen.getAllByRole('button', { name: 'Go to Dashboard' })
  ).toHaveLength(1)
  for (const button of screen.getAllByRole('button', {
    name: 'Go to Dashboard',
  })) {
    expect(button).toHaveAttribute('href', '/dashboard')
  }
  expect(
    screen.queryByRole('button', { name: 'Get Started' })
  ).not.toBeInTheDocument()
})
