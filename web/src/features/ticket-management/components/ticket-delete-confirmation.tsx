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

import { ConfirmDialog } from '@/components/confirm-dialog'

type TicketDeleteConfirmationProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  subject: string
  publicId: string
  isLoading: boolean
  onConfirm: () => void
}

export function TicketDeleteConfirmation({
  open,
  onOpenChange,
  subject,
  publicId,
  isLoading,
  onConfirm,
}: TicketDeleteConfirmationProps) {
  const { t } = useTranslation()
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('Move ticket to trash?')}
      desc={
        <span className='flex flex-col gap-1'>
          <span>{subject}</span>
          <code className='text-xs'>#{publicId}</code>
          <span>
            {t(
              'The ticket will be hidden from normal lists but can be restored.'
            )}
          </span>
        </span>
      }
      confirmText={t('Move to trash')}
      destructive
      isLoading={isLoading}
      handleConfirm={onConfirm}
    />
  )
}
