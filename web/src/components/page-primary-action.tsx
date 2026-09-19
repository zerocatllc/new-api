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
import { Plus } from 'lucide-react'
import type { ComponentProps, ReactNode } from 'react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type PagePrimaryActionProps = Omit<
  ComponentProps<typeof Button>,
  'children'
> & {
  children: ReactNode
  mobileLabel?: ReactNode
}

export function PagePrimaryAction(props: PagePrimaryActionProps) {
  const { children, mobileLabel, className, ...buttonProps } = props
  return (
    <Button
      className={cn('h-9 rounded-xl px-4 shadow-xs', className)}
      {...buttonProps}
    >
      <Plus data-icon='inline-start' aria-hidden='true' />
      {mobileLabel == null ? (
        children
      ) : (
        <>
          <span className='max-sm:hidden'>{children}</span>
          <span className='sm:hidden'>{mobileLabel}</span>
        </>
      )}
    </Button>
  )
}
