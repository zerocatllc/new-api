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
*/
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import type { PropsWithChildren, ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { PricingData, PricingModel } from '@/features/pricing/types'

import { ProviderMarquee } from '../components/sections/provider-marquee'

const getHomePricing = vi.hoisted(() => vi.fn())

vi.mock('../api', () => ({ getHomePricing }))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, values?: { count?: number }) =>
      key.replace('{{count}}', String(values?.count ?? '')),
  }),
}))

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to }: { children?: ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
}))

vi.mock('@/components/animate-in-view', () => ({
  AnimateInView: ({ children }: PropsWithChildren) => <div>{children}</div>,
}))

vi.mock('@/lib/lobe-icon', () => ({
  getLobeIcon: () => <span aria-hidden='true' />,
}))

function model(id: number, modelName: string, vendorId: number): PricingModel {
  return {
    id,
    model_name: modelName,
    vendor_id: vendorId,
    quota_type: 0,
    model_ratio: 1,
    completion_ratio: 1,
    enable_groups: ['default'],
  }
}

function pricingData(models: PricingModel[]): PricingData {
  return {
    success: true,
    data: models,
    vendors: [
      { id: 1, name: 'OpenAI', icon: 'OpenAI' },
      { id: 2, name: 'Moonshot', icon: 'Kimi' },
    ],
    group_ratio: { default: 1 },
    usable_group: {},
    supported_endpoint: {},
    auto_groups: [],
  }
}

function renderWithQuery(ui: ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>
  )
}

describe('homepage provider rail', () => {
  beforeEach(() => {
    getHomePricing.mockReset()
  })

  it('shows live providers as a logo-only rail without model metadata', async () => {
    getHomePricing.mockResolvedValue(
      pricingData([
        model(1, 'gpt-5.6-sol', 1),
        model(2, 'gpt-5.6', 1),
        model(3, 'kimi-k3', 2),
      ])
    )

    renderWithQuery(<ProviderMarquee />)

    expect(
      await screen.findByRole('heading', {
        name: "Bringing together the world's leading AI providers",
      })
    ).toBeVisible()
    expect(screen.getAllByText('OpenAI')).toHaveLength(2)
    expect(screen.getAllByText('Moonshot')).toHaveLength(2)
    expect(screen.queryByText('2 models')).not.toBeInTheDocument()
    expect(screen.queryByText('1 model')).not.toBeInTheDocument()
    expect(screen.queryByText('Anthropic')).not.toBeInTheDocument()
  })

  it('hides the provider rail when pricing is unavailable', async () => {
    getHomePricing.mockRejectedValue(new Error('pricing unavailable'))

    const { container } = renderWithQuery(<ProviderMarquee />)

    await waitFor(() => expect(getHomePricing).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(container).toBeEmptyDOMElement())
  })
})
