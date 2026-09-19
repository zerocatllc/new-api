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
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { expect, test, vi } from 'vitest'

import { SetupWizard } from './setup-wizard'

const getSetupStatus = vi.hoisted(() => vi.fn())

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => vi.fn(),
}))

vi.mock('@/hooks/use-system-config', () => ({
  useSystemConfig: () => ({
    systemName: 'zero.cat',
    logo: '/logo.png',
    loading: false,
  }),
}))

vi.mock('@/components/language-switcher', () => ({
  LanguageSwitcher: () => null,
}))

vi.mock('./api', () => ({
  buildSetupPayload: vi.fn(),
  getSetupStatus,
  submitSetup: vi.fn(),
}))

vi.mock('./components/admin-step', () => ({ AdminStep: () => null }))
vi.mock('./components/complete-step', () => ({ CompleteStep: () => null }))
vi.mock('./components/database-step', () => ({ DatabaseStep: () => null }))
vi.mock('./components/step-navigation', () => ({
  StepNavigation: () => null,
}))
vi.mock('./components/usage-mode-step', () => ({ UsageModeStep: () => null }))

test('shows a retryable error when setup status loading fails', async () => {
  getSetupStatus
    .mockRejectedValueOnce(new Error('gateway timeout'))
    .mockResolvedValueOnce({
      success: true,
      data: {
        status: false,
        root_init: true,
        SelfUseModeEnabled: false,
        DemoSiteEnabled: false,
      },
    })
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })

  render(
    <QueryClientProvider client={queryClient}>
      <SetupWizard />
    </QueryClientProvider>
  )

  expect(
    await screen.findByText('We could not load the setup status.')
  ).toBeInTheDocument()

  fireEvent.click(screen.getByRole('button', { name: 'Retry' }))

  await waitFor(() => expect(getSetupStatus).toHaveBeenCalledTimes(2))
  await waitFor(() =>
    expect(
      screen.queryByText('We could not load the setup status.')
    ).not.toBeInTheDocument()
  )
})
