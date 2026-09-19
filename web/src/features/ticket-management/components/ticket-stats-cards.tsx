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
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { ticketQueryKeys } from '@/features/tickets/lib/ticket-query-keys'

import { getTicketStatsAdmin } from '../api'

export function TicketStatsCards() {
  const { t } = useTranslation()
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ticketQueryKeys.adminStats,
    queryFn: async () => {
      const result = await getTicketStatsAdmin()
      if (!result.success || !result.data) {
        throw new Error(result.message || 'Failed to load ticket stats')
      }
      return result.data
    },
  })

  if (isError && !data) {
    return (
      <Alert variant='destructive' className='mb-4'>
        <AlertTitle>{t('Failed to load ticket stats')}</AlertTitle>
        <AlertDescription className='flex flex-col items-start gap-3'>
          <span>
            {error instanceof Error ? error.message : t('Unknown error')}
          </span>
          <Button
            type='button'
            size='sm'
            variant='outline'
            onClick={() => void refetch()}
          >
            {t('Retry')}
          </Button>
        </AlertDescription>
      </Alert>
    )
  }

  const tiles = [
    { label: t('Waiting on support'), value: data?.queues.waiting_on_staff },
    { label: t('Waiting on user'), value: data?.queues.waiting_on_user },
    { label: t('Assigned to me'), value: data?.queues.assigned_to_me },
    { label: t('Unassigned'), value: data?.queues.unassigned },
    { label: t('Resolved'), value: data?.queues.resolved },
  ]

  return (
    <div className='mb-4'>
      {isError && (
        <Alert variant='destructive' className='mb-3'>
          <AlertTitle>
            {t('Refresh failed. Showing previously loaded data.')}
          </AlertTitle>
          <AlertDescription className='flex flex-col items-start gap-2'>
            <Button
              type='button'
              size='sm'
              variant='outline'
              onClick={() => void refetch()}
            >
              {t('Retry')}
            </Button>
          </AlertDescription>
        </Alert>
      )}
      <div className='grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-5'>
        {tiles.map((tile) => (
          <Card key={tile.label} className='py-3'>
            <CardContent className='px-4'>
              <div className='text-muted-foreground text-xs font-medium'>
                {tile.label}
              </div>
              {isLoading ? (
                <Skeleton className='mt-1.5 h-7 w-12' />
              ) : (
                <div className='text-foreground mt-1 font-mono text-2xl font-semibold tabular-nums'>
                  {tile.value ?? 0}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
