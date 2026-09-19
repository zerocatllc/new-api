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
import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

import type { TopNavLink } from '../types'
import { PublicHeader, type PublicHeaderProps } from './public-header'

type PublicLayoutProps = {
  children: ReactNode
  showMainContainer?: boolean
  navContent?: ReactNode
  headerProps?: Omit<PublicHeaderProps, 'navContent'>
  navLinks?: TopNavLink[]
  showThemeSwitch?: boolean
  showAuthButtons?: boolean
  showNotifications?: boolean
  logo?: ReactNode
  siteName?: string
}

export function PublicLayout(props: PublicLayoutProps) {
  // The whole public surface (home / pricing / rankings / about / legal) shares
  // All public pages use the landing marketing header (logo + inline nav, no
  // app search bar). The hairline frame + marketing strip are gated to the
  // home page inside PublicHeader; other landing pages get a clean solid header.
  // The strip only appears when the caller passes a real (backend) banner —
  // there is no marketing default.
  const variant = props.headerProps?.variant ?? 'landing'
  const isLanding = variant === 'landing'
  const announcement = props.headerProps?.announcement

  // No SearchProvider here: the command palette navigates the console and its
  // ⌘K listener is global, so mounting it on the public surface handed visitors
  // the whole admin route map before they had even signed in.
  return (
    <div
      data-theme-preset='anthropic'
      className='bg-background text-foreground relative min-h-svh overflow-x-clip'
    >
      <PublicHeader
        navContent={props.navContent}
        navLinks={props.navLinks}
        showThemeSwitch={props.showThemeSwitch}
        showAuthButtons={props.showAuthButtons}
        showNotifications={props.showNotifications}
        logo={props.logo}
        siteName={props.siteName}
        {...props.headerProps}
        variant={variant}
        announcement={announcement}
      />

      {props.showMainContainer !== false ? (
        // The landing header is sticky (in-flow), so the container no longer
        // needs the fixed-header pt-20 offset — just normal vertical padding.
        <main
          className={cn(
            'container px-4 py-6 md:px-4',
            isLanding ? 'pt-8' : 'pt-20'
          )}
        >
          {props.children}
        </main>
      ) : (
        props.children
      )}
    </div>
  )
}
