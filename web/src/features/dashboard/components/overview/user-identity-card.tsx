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
import { Link } from '@tanstack/react-router'
import { CreditCard, KeyRound } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { useSystemConfig } from '@/hooks/use-system-config'
import { formatQuota } from '@/lib/format'
import { ROLE, getRoleLabel } from '@/lib/roles'
import { useAuthStore } from '@/stores/auth-store'

export function UserIdentityCard() {
  const { t } = useTranslation()
  const { systemName, logo } = useSystemConfig()
  const user = useAuthStore((state) => state.auth.user)

  const handle = user?.display_name || user?.username || t('User')
  const memberNo = user?.id ? `NO.${String(user.id).padStart(5, '0')}` : null
  const roleLabel =
    user && user.role > ROLE.USER ? getRoleLabel(user.role) : null

  return (
    <div className='bg-card text-card-foreground border-border/80 flex flex-col overflow-hidden rounded-xl border md:flex-row'>
      <div className='flex min-w-0 flex-1 flex-col gap-5 border-b p-5 sm:p-6 md:border-r md:border-b-0'>
        <div className='text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-1 text-xs'>
          <span className='border-border/80 flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-medium'>
            {logo ? (
              <img
                src={logo}
                alt=''
                aria-hidden='true'
                className='size-4 shrink-0 rounded-full object-cover'
              />
            ) : null}
            {systemName}
          </span>
          {memberNo ? (
            <span className='font-mono tracking-wider'>{memberNo}</span>
          ) : null}
          {roleLabel ? (
            <>
              <span aria-hidden='true'>·</span>
              <span>{roleLabel}</span>
            </>
          ) : null}
        </div>

        <div className='min-w-0'>
          <h3 className='truncate text-2xl font-semibold tracking-tight sm:text-3xl'>
            {t('Welcome back, {{name}}', { name: handle })}
          </h3>
        </div>

        <div className='mt-auto min-w-0'>
          <p className='text-muted-foreground text-xs font-medium'>
            {t('Available Balance')}
          </p>
          <p className='mt-1 truncate text-3xl font-semibold tracking-tight tabular-nums'>
            {formatQuota(Number(user?.quota ?? 0))}
          </p>
        </div>
      </div>

      <div className='bg-muted/30 flex w-full shrink-0 flex-col justify-center gap-3 p-5 sm:p-6 md:w-72'>
        <h4 className='text-muted-foreground text-xs font-semibold tracking-wider uppercase'>
          {t('Quick Actions')}
        </h4>
        <Button
          className='btn-squish h-10 justify-start gap-2 px-3'
          render={<Link to='/wallet' />}
        >
          <CreditCard data-icon='inline-start' />
          {t('Recharge')}
        </Button>
        <Button
          variant='secondary'
          className='btn-squish h-10 justify-start gap-2 px-3'
          render={<Link to='/keys' />}
        >
          <KeyRound data-icon='inline-start' />
          {t('API Keys')}
        </Button>
      </div>
    </div>
  )
}
