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
import { Link, useLocation } from '@tanstack/react-router'
import {
  BookOpen,
  Boxes,
  CircleHelp,
  Compass,
  ExternalLink,
  House,
  LayoutDashboard,
  Trophy,
  X,
} from 'lucide-react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  SidebarTrigger,
  useSidebar,
} from '@/components/ui/sidebar'
import { useLayout } from '@/context/layout-provider'
import { useSidebarView } from '@/hooks/use-sidebar-view'
import { useTopNavLinks } from '@/hooks/use-top-nav-links'
import { MOTION_TRANSITION, MOTION_VARIANTS } from '@/lib/motion'
import { cn } from '@/lib/utils'

import { isTopNavLinkActive } from '../lib/mobile-navigation'
import { NavGroup } from './nav-group'
import { SidebarPanelSwitcher } from './sidebar-panel-switcher'
import { SidebarViewHeader } from './sidebar-view-header'
import { SystemBrand } from './system-brand'

function getMobileTopNavIcon(href: string, external?: boolean) {
  if (external) return ExternalLink
  if (href === '/') return House
  if (href.startsWith('/dashboard')) return LayoutDashboard
  if (href.startsWith('/pricing')) return Boxes
  if (href.startsWith('/rankings')) return Trophy
  if (href.startsWith('/docs')) return BookOpen
  if (href.startsWith('/about')) return CircleHelp
  return Compass
}

function MobileSidebarHeader() {
  const { t } = useTranslation()
  const { setOpenMobile } = useSidebar()

  return (
    <SidebarHeader className='border-sidebar-border border-b p-2 md:hidden'>
      <div className='flex h-10 items-center justify-between gap-2'>
        <SystemBrand variant='inline' showInlineNameOnMobile />
        <Button
          variant='ghost'
          size='icon-sm'
          onClick={() => setOpenMobile(false)}
          aria-label={t('Close menu')}
        >
          <X />
        </Button>
      </div>
    </SidebarHeader>
  )
}

function MobileTopNavigation() {
  const { t } = useTranslation()
  const pathname = useLocation({ select: (location) => location.pathname })
  const links = useTopNavLinks()
  const { setOpenMobile } = useSidebar()

  if (links.length === 0) return null

  return (
    <SidebarGroup className='border-sidebar-border border-t px-2 py-2 md:hidden'>
      <SidebarGroupLabel>{t('Header navigation')}</SidebarGroupLabel>
      <SidebarMenu>
        {links.map((link) => {
          const Icon = getMobileTopNavIcon(link.href, link.external)
          const disabled = Boolean(link.disabled)
          const content = (
            <>
              <Icon className='shrink-0' />
              <span className='min-w-0 flex-1 truncate'>{link.title}</span>
            </>
          )

          return (
            <SidebarMenuItem key={`${link.title}-${link.href}`}>
              <SidebarMenuButton
                isActive={isTopNavLinkActive(pathname, link.href)}
                tooltip={link.title}
                aria-disabled={disabled}
                className={cn(disabled && 'pointer-events-none opacity-50')}
                render={
                  link.external ? (
                    <a
                      href={link.href}
                      target='_blank'
                      rel='noopener noreferrer'
                      onClick={() => setOpenMobile(false)}
                    />
                  ) : (
                    <Link
                      to={link.href}
                      disabled={disabled}
                      onClick={() => setOpenMobile(false)}
                    />
                  )
                }
              >
                {content}
              </SidebarMenuButton>
            </SidebarMenuItem>
          )
        })}
      </SidebarMenu>
    </SidebarGroup>
  )
}

/**
 * Application sidebar.
 *
 * Adopts the Vercel / Cloudflare "drill-in" pattern: the URL drives
 * which sidebar *view* is rendered. Clicking a top-level entry like
 * `System Settings` swaps the sidebar to a contextual workspace —
 * with a `← Back to Dashboard` affordance — instead of stacking the
 * sub-navigation inside the root tree.
 *
 * Architecture:
 *   - View resolution + filtering: {@link useSidebarView}
 *   - View registry: `layout/lib/sidebar-view-registry.ts`
 *   - Per-view header: {@link SidebarViewHeader}
 *
 * Adding a new nested view only requires registering a {@link SidebarView}
 * in the registry; this component requires no changes.
 */
export function AppSidebar() {
  const { collapsible, variant } = useLayout()
  const { key, view, navGroups } = useSidebarView()
  const shouldReduce = useReducedMotion()

  return (
    <Sidebar collapsible={collapsible} variant={variant}>
      <MobileSidebarHeader />
      {view ? <SidebarViewHeader view={view} /> : <SidebarPanelSwitcher />}

      <SidebarContent>
        <AnimatePresence mode='wait' initial={false}>
          <motion.div
            key={key}
            initial={
              shouldReduce ? false : MOTION_VARIANTS.sidebarSlide.initial
            }
            animate={MOTION_VARIANTS.sidebarSlide.animate}
            exit={shouldReduce ? undefined : MOTION_VARIANTS.sidebarSlide.exit}
            transition={MOTION_TRANSITION.fast}
            className='flex flex-col gap-2'
          >
            {navGroups.map((props) => (
              <NavGroup key={props.id || props.title} {...props} />
            ))}
          </motion.div>
        </AnimatePresence>
        <MobileTopNavigation />
      </SidebarContent>

      <SidebarFooter className='hidden p-2 md:block'>
        <SidebarTrigger
          variant='ghost'
          className='text-muted-foreground hover:text-foreground size-8'
        />
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  )
}
