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
import { RefreshCw, Settings, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { PagePrimaryAction } from '@/components/page-primary-action'
import { Button } from '@/components/ui/button'
import { useAuthStore } from '@/stores/auth-store'

import { getTicketPermissions } from '../ticket-permissions'
import { useTicketManagement } from './ticket-management-provider'

export function TicketManagementPrimaryButtons() {
  const { t } = useTranslation()
  const { setOpen, triggerRefresh } = useTicketManagement()
  const currentUser = useAuthStore((state) => state.auth.user)
  const permissions = getTicketPermissions(currentUser)

  if (!permissions.canRead && !permissions.canDelete) return null

  return (
    <div className='flex items-center gap-2'>
      {permissions.canRead && (
        <Button
          size='icon-sm'
          variant='outline'
          onClick={() => triggerRefresh({ stats: true })}
          aria-label={t('Refresh tickets')}
        >
          <RefreshCw />
        </Button>
      )}
      {permissions.canManage && (
        <PagePrimaryAction onClick={() => setOpen('create')}>
          {t('Create Ticket')}
        </PagePrimaryAction>
      )}
      {permissions.canDelete && (
        <Button size='sm' variant='outline' onClick={() => setOpen('trash')}>
          <Trash2 data-icon='inline-start' />
          <span>{t('Ticket Trash')}</span>
        </Button>
      )}
      {permissions.canWriteSettings && (
        <Button size='sm' variant='outline' onClick={() => setOpen('settings')}>
          <Settings data-icon='inline-start' />
          <span>{t('Ticket Settings')}</span>
        </Button>
      )}
    </div>
  )
}
