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
import { Check, ChevronsUpDown } from 'lucide-react'
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar'
import { SIDEBAR_PANELS, useSidebarPanel } from '@/hooks/use-sidebar-panel'

function isTypingTarget(el: Element | null): boolean {
  if (!el) return false
  const tag = el.tagName
  return (
    tag === 'INPUT' ||
    tag === 'TEXTAREA' ||
    tag === 'SELECT' ||
    (el as HTMLElement).isContentEditable
  )
}

/**
 * Top-of-sidebar panel switcher (user workspace ↔ admin console).
 *
 * Rendered only for admins — a single-panel user has nothing to switch to, so
 * the sidebar starts directly with the nav groups (unchanged behavior).
 * Switching navigates to the target panel's home; F1/F2 are shortcuts.
 */
export function SidebarPanelSwitcher() {
  const { t } = useTranslation()
  const { panel, canAdmin, setPanel } = useSidebarPanel()
  const { state, isMobile, setOpenMobile } = useSidebar()
  const compact = state === 'collapsed' && !isMobile

  useEffect(() => {
    if (!canAdmin) return
    function onKey(event: KeyboardEvent) {
      if (event.altKey || event.ctrlKey || event.metaKey) return
      const target = SIDEBAR_PANELS.find((p) => p.shortcut === event.key)
      if (!target || isTypingTarget(document.activeElement)) return
      event.preventDefault()
      setPanel(target.id)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [canAdmin, setPanel])

  if (!canAdmin) return null

  const active = SIDEBAR_PANELS.find((p) => p.id === panel) ?? SIDEBAR_PANELS[0]

  const ActiveIcon = active.icon

  return (
    <SidebarHeader className='px-2 pt-2 pb-1'>
      <SidebarMenu>
        <SidebarMenuItem>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <SidebarMenuButton
                  size='lg'
                  aria-label={t(active.label)}
                  tooltip={t(active.label)}
                  className='border-sidebar-border bg-sidebar-accent/40 h-14 border shadow-xs group-data-[collapsible=icon]:justify-center'
                />
              }
            >
              <ActiveIcon className='size-4 shrink-0' aria-hidden='true' />
              {!compact && (
                <>
                  <span className='grid min-w-0 flex-1 text-left leading-tight'>
                    <span className='truncate text-sm font-semibold'>
                      {t(active.label)}
                    </span>
                    <span className='text-muted-foreground truncate text-xs'>
                      {t(active.subtitle)}
                    </span>
                  </span>
                  <ChevronsUpDown className='text-muted-foreground ml-auto size-4 shrink-0' />
                </>
              )}
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align='start'
              className='w-(--anchor-width) min-w-56'
            >
              <DropdownMenuGroup>
                <DropdownMenuLabel className='text-muted-foreground text-xs'>
                  {t('Switch Panel')}
                </DropdownMenuLabel>
                {SIDEBAR_PANELS.map((p) => {
                  const Icon = p.icon
                  const isActive = p.id === panel
                  return (
                    <DropdownMenuItem
                      key={p.id}
                      onSelect={() => {
                        setOpenMobile(false)
                        setPanel(p.id)
                      }}
                      className='gap-2'
                    >
                      <span className='bg-primary/10 text-primary ring-primary/20 flex size-7 shrink-0 items-center justify-center rounded-full ring-1'>
                        <Icon className='size-4' />
                      </span>
                      <span className='flex-1 truncate'>{t(p.label)}</span>
                      {isActive ? (
                        <Check className='text-primary size-4 shrink-0' />
                      ) : (
                        <DropdownMenuShortcut>
                          {p.shortcut}
                        </DropdownMenuShortcut>
                      )}
                    </DropdownMenuItem>
                  )
                })}
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarHeader>
  )
}
