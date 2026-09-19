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
import { RefreshCw } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { PagePrimaryAction } from '@/components/page-primary-action'
import { Button } from '@/components/ui/button'

import { useTickets } from './tickets-provider'

export function TicketsPrimaryButtons() {
  const { t } = useTranslation()
  const { setOpen, triggerRefresh, enabled } = useTickets()

  return (
    <div className='flex items-center gap-2'>
      <Button
        size='icon-sm'
        variant='outline'
        onClick={triggerRefresh}
        aria-label={t('Refresh tickets')}
      >
        <RefreshCw />
      </Button>
      <PagePrimaryAction onClick={() => setOpen('create')} disabled={!enabled}>
        {t('New Ticket')}
      </PagePrimaryAction>
    </div>
  )
}
