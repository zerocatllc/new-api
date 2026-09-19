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
import { render, screen } from '@testing-library/react'
import { beforeEach, expect, test, vi } from 'vitest'

import { usePricingData } from './use-pricing-data'

const getPricing = vi.hoisted(() => vi.fn())

vi.mock('../api', () => ({ getPricing }))
vi.mock('@/hooks/use-status', () => ({
  useStatus: () => ({ status: { price: 1, usd_exchange_rate: 1 } }),
}))

function PricingProbe() {
  const pricing = usePricingData()
  if (pricing.isLoading) return <div>loading</div>
  return <div>{pricing.models.map((model) => model.model_name).join(',')}</div>
}

beforeEach(() => {
  getPricing.mockReset()
})

test('does not pass the React Query context object as Axios request config', async () => {
  getPricing.mockResolvedValue({
    success: true,
    data: [
      {
        id: 1,
        model_name: 'gpt-5.6',
        vendor_id: 1,
        quota_type: 0,
        model_ratio: 1,
        completion_ratio: 1,
        enable_groups: ['default'],
      },
    ],
    vendors: [{ id: 1, name: 'OpenAI', icon: 'OpenAI' }],
    group_ratio: { default: 1 },
    usable_group: {},
    supported_endpoint: {},
    auto_groups: [],
  })
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })

  render(
    <QueryClientProvider client={queryClient}>
      <PricingProbe />
    </QueryClientProvider>
  )

  expect(await screen.findByText('gpt-5.6')).toBeVisible()
  expect(getPricing).toHaveBeenCalledWith()
})
