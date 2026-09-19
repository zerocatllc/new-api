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

import { SectionPageLayout } from '@/components/layout'

import { TicketManagementDialogs } from './components/ticket-management-dialogs'
import { TicketManagementPrimaryButtons } from './components/ticket-management-primary-buttons'
import { TicketManagementProvider } from './components/ticket-management-provider'
import { TicketsAdminTable } from './components/tickets-admin-table'

export function TicketManagement() {
  const { t } = useTranslation()
  return (
    <TicketManagementProvider>
      <SectionPageLayout fixedContent>
        <SectionPageLayout.Title>
          {t('Ticket Management')}
        </SectionPageLayout.Title>
        <SectionPageLayout.Actions>
          <TicketManagementPrimaryButtons />
        </SectionPageLayout.Actions>
        <SectionPageLayout.Content>
          <TicketsAdminTable />
        </SectionPageLayout.Content>
      </SectionPageLayout>

      <TicketManagementDialogs />
    </TicketManagementProvider>
  )
}
