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
import { RotateCcw } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { formatTimestampToDate } from '@/lib/format'

import { listDeletedTicketsAdmin, restoreTicketAdmin } from '../api'
import { useTicketManagement } from './ticket-management-provider'

const TRASH_PAGE_SIZE = 20

type TicketTrashDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function TicketTrashDialog({
  open,
  onOpenChange,
}: TicketTrashDialogProps) {
  const { t } = useTranslation()
  const { triggerRefresh } = useTicketManagement()
  const [page, setPage] = useState(1)
  const [restoringId, setRestoringId] = useState<string | null>(null)
  const query = useQuery({
    queryKey: ['ticket-trash', page],
    queryFn: async () => {
      const result = await listDeletedTicketsAdmin(page, TRASH_PAGE_SIZE)
      if (!result.success || !result.data) {
        throw new Error(result.message || 'Failed to load ticket trash')
      }
      return result
    },
    enabled: open,
  })
  const tickets = query.data?.data?.items ?? []
  const total = query.data?.data?.total ?? 0
  const hasNext = page * TRASH_PAGE_SIZE < total

  const handleRestore = async (publicId: string, expectedVersion: number) => {
    setRestoringId(publicId)
    try {
      const result = await restoreTicketAdmin(publicId, expectedVersion)
      if (result.success) {
        toast.success(t('Ticket restored'))
        triggerRefresh({ stats: true })
        await query.refetch()
      } else {
        toast.error(result.message || t('Failed to restore ticket'))
        await query.refetch()
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t('Failed to restore ticket')
      )
    } finally {
      setRestoringId(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='sm:max-w-3xl'>
        <DialogHeader>
          <DialogTitle>{t('Ticket Trash')}</DialogTitle>
          <DialogDescription>
            {t(
              'Deleted tickets can be restored. Messages and attachments are retained.'
            )}
          </DialogDescription>
        </DialogHeader>

        <div className='max-h-[60vh] space-y-2 overflow-y-auto'>
          {query.isLoading && (
            <p className='text-muted-foreground py-8 text-center text-sm'>
              {t('Loading...')}
            </p>
          )}
          {query.isError && (
            <Alert variant='destructive'>
              <AlertTitle>{t('Failed to load ticket trash')}</AlertTitle>
              <AlertDescription className='flex flex-col items-start gap-3'>
                <span>
                  {query.error instanceof Error
                    ? query.error.message
                    : t('Unknown error')}
                </span>
                <Button
                  type='button'
                  size='sm'
                  variant='outline'
                  onClick={() => void query.refetch()}
                >
                  {t('Retry')}
                </Button>
              </AlertDescription>
            </Alert>
          )}
          {!query.isLoading && !query.isError && tickets.length === 0 && (
            <p className='text-muted-foreground py-8 text-center text-sm'>
              {t('Trash is empty')}
            </p>
          )}
          {!query.isError &&
            tickets.map((ticket) => (
              <div
                key={ticket.public_id}
                className='flex items-center justify-between gap-4 rounded-lg border p-3'
              >
                <div className='min-w-0'>
                  <p className='truncate text-sm font-medium'>
                    {ticket.subject}
                  </p>
                  <p className='text-muted-foreground text-xs'>
                    #{ticket.public_id}
                    {ticket.deleted_at
                      ? ` · ${formatTimestampToDate(ticket.deleted_at)}`
                      : ''}
                  </p>
                </div>
                <Button
                  type='button'
                  size='sm'
                  variant='outline'
                  disabled={restoringId === ticket.public_id}
                  onClick={() =>
                    void handleRestore(ticket.public_id, ticket.version)
                  }
                >
                  <RotateCcw data-icon='inline-start' />
                  {t('Restore')}
                </Button>
              </div>
            ))}
        </div>

        <DialogFooter className='justify-between sm:justify-between'>
          {!query.isError && (
            <span className='text-muted-foreground text-xs'>
              {t('{{count}} deleted tickets', { count: total })}
            </span>
          )}
          <div className='flex gap-2'>
            <Button
              type='button'
              variant='outline'
              size='sm'
              disabled={query.isError || page === 1}
              onClick={() => setPage((current) => current - 1)}
            >
              {t('Previous')}
            </Button>
            <Button
              type='button'
              variant='outline'
              size='sm'
              disabled={query.isError || !hasNext}
              onClick={() => setPage((current) => current + 1)}
            >
              {t('Next')}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
