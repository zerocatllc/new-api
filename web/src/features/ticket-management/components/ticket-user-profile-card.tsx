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

import { StatusBadge } from '@/components/status-badge'
import type { TicketUserProfile } from '@/features/tickets/types'
import { USER_STATUSES } from '@/features/users/constants'
import { formatQuota } from '@/lib/format'
import { getRoleLabel } from '@/lib/roles'

type TicketUserProfileCardProps = {
  profile: TicketUserProfile
}

// Requester account snapshot for staff investigating a ticket. Only rendered
// when the backend actually returned user_profile, which itself only happens
// when the caller holds authz.TicketViewUserProfile — see GetTicketAdmin.
export function TicketUserProfileCard({ profile }: TicketUserProfileCardProps) {
  const { t } = useTranslation()
  const statusConfig =
    USER_STATUSES[profile.status as keyof typeof USER_STATUSES]

  return (
    <div className='border-border/70 flex flex-wrap items-center gap-x-4 gap-y-1.5 border-b px-4 py-2.5 text-xs sm:px-6'>
      <span className='text-muted-foreground'>{t('Requester account')}</span>
      <span>
        {t('Quota')}: {formatQuota(profile.quota)}
      </span>
      <span>
        {t('Group')}: {profile.group}
      </span>
      <span>
        {t('Role')}: {getRoleLabel(profile.role)}
      </span>
      {statusConfig ? (
        <StatusBadge
          label={t(statusConfig.labelKey)}
          variant={statusConfig.variant}
          copyable={false}
        />
      ) : (
        <span>
          {t('Status')}: {profile.status}
        </span>
      )}
    </div>
  )
}
