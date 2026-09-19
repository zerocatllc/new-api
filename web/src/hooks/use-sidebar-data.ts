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
import {
  Activity,
  Box,
  ClipboardList,
  CreditCard,
  FlaskConical,
  Key,
  LayoutDashboard,
  MessageSquare,
  PlugZap,
  Radio,
  ServerCog,
  ScrollText,
  ShieldCheck,
  Ticket,
  User,
  Users,
  Wallet,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { getSystemSettingsNavGroups } from '@/components/layout/config/system-settings.config'
import type { SidebarData } from '@/components/layout/types'
import {
  useTicketBadges,
  extSupportTicketsItems,
  extTicketManagementItems,
} from '@/ext/sidebar'
import { ROLE } from '@/lib/roles'

/**
 * Root navigation groups for the application sidebar.
 *
 * These are shown when the URL does not match any nested sidebar view
 * registered in `layout/lib/sidebar-view-registry.ts`.
 */
export function useSidebarData(): SidebarData {
  const { t } = useTranslation()
  const { myTicketBadge, adminTicketBadge, canReadTickets } = useTicketBadges()

  return {
    navGroups: [
      {
        id: 'chat',
        title: t('Chat'),
        items: [
          {
            title: t('Playground'),
            url: '/playground',
            icon: FlaskConical,
          },
          {
            title: t('Chat'),
            icon: MessageSquare,
            type: 'chat-presets',
          },
        ],
      },
      {
        id: 'build-and-usage',
        title: t('Build & Usage'),
        items: [
          {
            title: t('Workspace'),
            url: '/dashboard',
            activeUrls: ['/dashboard/overview'],
            icon: LayoutDashboard,
          },
          {
            title: t('Dashboard'),
            url: '/dashboard/models',
            icon: Activity,
          },
          {
            title: t('API Keys'),
            url: '/keys',
            icon: Key,
          },
          {
            title: t('Logs'),
            url: '/usage-logs/common',
            activeUrls: [
              '/usage-logs/common',
              '/usage-logs/task',
              '/usage-logs/drawing',
            ],
            configUrls: [
              '/usage-logs/common',
              '/usage-logs/task',
              '/usage-logs/drawing',
            ],
            icon: ScrollText,
          },
          {
            title: t('Audit Logs'),
            url: '/usage-logs/audit',
            icon: ClipboardList,
          },
        ],
      },
      {
        id: 'finance',
        title: t('Finances'),
        items: [
          {
            title: t('Wallet'),
            url: '/wallet',
            icon: Wallet,
          },
        ],
      },
      {
        id: 'account-and-security',
        title: t('Account & Security'),
        items: [
          ...extSupportTicketsItems(t, myTicketBadge),
          {
            title: t('Profile'),
            url: '/profile',
            icon: User,
          },
          {
            title: t('Security & Access'),
            url: '/security',
            icon: ShieldCheck,
          },
        ],
      },
      // --- Admin panel groups (panel: 'admin'). Subdivided for parity with the
      // reference console; every route here already exists in this fork. The
      // Analytics group reuses the shared data routes (Overview / Dashboard /
      // Logs), which render admin-scoped data for admins. ---
      {
        id: 'admin-analytics',
        title: t('Analytics'),
        panel: 'admin',
        items: [
          {
            title: t('Overview'),
            url: '/dashboard/overview',
            icon: Activity,
          },
          {
            title: t('Dashboard'),
            url: '/dashboard/models',
            icon: LayoutDashboard,
          },
          {
            title: t('Logs'),
            url: '/usage-logs/common',
            activeUrls: [
              '/usage-logs/common',
              '/usage-logs/task',
              '/usage-logs/drawing',
            ],
            configUrls: [
              '/usage-logs/common',
              '/usage-logs/task',
              '/usage-logs/drawing',
            ],
            icon: ScrollText,
          },
          {
            title: t('Audit Logs'),
            url: '/usage-logs/audit',
            icon: ClipboardList,
          },
          {
            title: t('System Info'),
            url: '/system-info',
            icon: ServerCog,
            requiredRole: ROLE.SUPER_ADMIN,
          },
        ],
      },
      {
        id: 'admin-gateway',
        title: t('Gateway'),
        panel: 'admin',
        items: [
          {
            title: t('Channels'),
            url: '/channels',
            icon: Radio,
          },
          {
            title: t('Models'),
            url: '/models/metadata',
            icon: Box,
          },
          {
            title: t('Task Plugins'),
            url: '/task-plugins',
            icon: PlugZap,
            requiredRole: ROLE.SUPER_ADMIN,
          },
        ],
      },
      {
        id: 'admin-members',
        title: t('Members'),
        panel: 'admin',
        items: [
          {
            title: t('Users'),
            url: '/users',
            icon: Users,
          },
          {
            title: t('Redemption Codes'),
            url: '/redemption-codes',
            icon: Ticket,
          },
          ...extTicketManagementItems(t, canReadTickets, adminTicketBadge),
          {
            title: t('Subscriptions'),
            url: '/subscriptions',
            icon: CreditCard,
          },
        ],
      },
      // System settings sections surfaced directly into the admin panel, each
      // as its OWN group (header + flat sub-page links), matching the rest of
      // the sidebar — not a single collapsible "System Administration" group.
      ...getSystemSettingsNavGroups(t).flatMap((group) =>
        group.items.flatMap((section) =>
          section.items
            ? [
                {
                  id: `admin-settings-${section.title}`,
                  title: section.title,
                  panel: 'admin' as const,
                  // Long settings list: start folded to keep the sidebar tidy;
                  // the structural groups above stay expanded.
                  defaultCollapsed: true,
                  // /system-settings/* routes are SUPER_ADMIN-guarded; hide
                  // the links from plain admins instead of serving dead 403s.
                  items: section.items.map((item) => ({
                    ...item,
                    requiredRole: ROLE.SUPER_ADMIN,
                  })),
                },
              ]
            : []
        )
      ),
    ],
  }
}
