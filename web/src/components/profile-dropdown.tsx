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
import { useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { SignOutDialog } from '@/components/sign-out-dialog'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { SelfUserAvatar } from '@/components/user-avatar'
import useDialogState from '@/hooks/use-dialog'
import { useIsSidebarModuleVisible } from '@/hooks/use-sidebar-config'
import { useUserDisplay } from '@/hooks/use-user-display'
import { formatQuota } from '@/lib/format'
import { ROLE } from '@/lib/roles'
import { useAuthStore } from '@/stores/auth-store'

export function ProfileDropdown() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [open, setOpen] = useDialogState()
  const user = useAuthStore((state) => state.auth.user)
  const { displayName } = useUserDisplay(user)
  const isSuperAdmin = user?.role === ROLE.SUPER_ADMIN
  const isWalletVisible = useIsSidebarModuleVisible('/wallet')
  const isSecurityVisible = useIsSidebarModuleVisible('/security')
  const avatarName = user?.username || displayName

  return (
    <>
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger
          render={
            <Button
              variant='ghost'
              className='relative size-8 overflow-hidden rounded-full p-0'
            />
          }
        >
          <SelfUserAvatar name={avatarName} className='size-8' />
        </DropdownMenuTrigger>
        <DropdownMenuContent align='end' sideOffset={8} className='w-56'>
          <div className='flex items-center gap-2 px-2 py-1.5'>
            <SelfUserAvatar name={avatarName} className='size-9' />
            <div className='flex flex-1 flex-col gap-0.5 overflow-hidden'>
              <p className='text-foreground truncate text-sm font-semibold'>
                {displayName}
              </p>
              {user?.username && (
                <p className='text-muted-foreground truncate text-xs'>
                  @{user.username}
                </p>
              )}
              {user?.email && (
                <p className='text-muted-foreground truncate text-xs'>
                  {user.email}
                </p>
              )}
            </div>
          </div>

          <DropdownMenuSeparator />

          <div className='space-y-1.5 px-2 py-1.5'>
            <div className='flex items-center justify-between text-xs'>
              <span className='text-muted-foreground'>{t('Balance')}</span>
              <span className='text-brand font-medium tabular-nums'>
                {formatQuota(user?.quota ?? 0)}
              </span>
            </div>
            {user?.group && (
              <div className='flex items-center justify-between text-xs'>
                <span className='text-muted-foreground'>{t('Group')}</span>
                <span className='max-w-[60%] truncate font-medium'>
                  {String(user.group)}
                </span>
              </div>
            )}
          </div>

          <DropdownMenuSeparator />

          <DropdownMenuItem onClick={() => navigate({ to: '/profile' })}>
            {t('Profile')}
          </DropdownMenuItem>

          {isSecurityVisible && (
            <DropdownMenuItem onClick={() => navigate({ to: '/security' })}>
              {t('Security & Access')}
            </DropdownMenuItem>
          )}

          {isWalletVisible && (
            <DropdownMenuItem onClick={() => navigate({ to: '/wallet' })}>
              {t('Wallet')}
            </DropdownMenuItem>
          )}

          {isSuperAdmin && (
            <DropdownMenuItem
              onClick={() =>
                navigate({
                  to: '/system-settings/site/$section',
                  params: { section: 'system-info' },
                })
              }
            >
              {t('System Settings')}
            </DropdownMenuItem>
          )}

          <DropdownMenuSeparator />

          <DropdownMenuItem variant='destructive' onClick={() => setOpen(true)}>
            {t('Sign out')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <SignOutDialog open={!!open} onOpenChange={setOpen} />
    </>
  )
}
