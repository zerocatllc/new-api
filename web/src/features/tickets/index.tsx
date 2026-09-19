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
import { useTranslation } from 'react-i18next'

import { SectionPageLayout } from '@/components/layout'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'

import { TicketsDialogs } from './components/tickets-dialogs'
import { TicketsPrimaryButtons } from './components/tickets-primary-buttons'
import { TicketsProvider, useTickets } from './components/tickets-provider'
import { TicketsTable } from './components/tickets-table'

function TicketsContent() {
  const { t } = useTranslation()
  const {
    enabled,
    capabilitiesLoading,
    capabilitiesError,
    capabilitiesRefreshFailed,
    refetchCapabilities,
  } = useTickets()
  if (capabilitiesLoading) return null
  if (capabilitiesError) {
    return (
      <Alert variant='destructive'>
        <AlertTitle>{t('Failed to load ticket system status')}</AlertTitle>
        <AlertDescription className='flex flex-col items-start gap-3'>
          <Button
            type='button'
            size='sm'
            variant='outline'
            onClick={refetchCapabilities}
          >
            {t('Retry')}
          </Button>
        </AlertDescription>
      </Alert>
    )
  }
  const refreshFailedBanner = capabilitiesRefreshFailed ? (
    <Alert variant='destructive' className='mb-3'>
      <AlertTitle>
        {t('Refresh failed. Showing previously loaded data.')}
      </AlertTitle>
      <AlertDescription>
        <Button
          type='button'
          size='sm'
          variant='outline'
          onClick={refetchCapabilities}
        >
          {t('Retry')}
        </Button>
      </AlertDescription>
    </Alert>
  ) : null
  if (!enabled) {
    return (
      <>
        {refreshFailedBanner}
        <div className='flex min-h-64 flex-col items-center justify-center rounded-xl border border-dashed text-center'>
          <p className='font-medium'>{t('Ticket system is disabled')}</p>
          <p className='text-muted-foreground mt-1 text-sm'>
            {t('Please contact an administrator if you need assistance.')}
          </p>
        </div>
      </>
    )
  }
  return (
    <>
      {refreshFailedBanner}
      <TicketsTable />
    </>
  )
}

export function Tickets() {
  const { t } = useTranslation()
  return (
    <TicketsProvider>
      <SectionPageLayout fixedContent>
        <SectionPageLayout.Title>
          {t('Support Tickets')}
        </SectionPageLayout.Title>
        <SectionPageLayout.Actions>
          <TicketsPrimaryButtons />
        </SectionPageLayout.Actions>
        <SectionPageLayout.Content>
          <TicketsContent />
        </SectionPageLayout.Content>
      </SectionPageLayout>

      <TicketsDialogs />
    </TicketsProvider>
  )
}
