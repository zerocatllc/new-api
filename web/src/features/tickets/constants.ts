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
import type { TicketCategory, TicketPriority } from './types'

export const TICKET_CATEGORIES = [
  'general',
  'technical',
  'billing',
  'feature',
  'bug',
  'other',
] as const satisfies readonly TicketCategory[]

export const TICKET_PRIORITIES = [
  'low',
  'normal',
  'high',
  'critical',
] as const satisfies readonly TicketPriority[]

export const TICKET_CATEGORY_LABELS: Record<TicketCategory, string> = {
  general: 'General',
  technical: 'Technical',
  billing: 'Billing',
  feature: 'Feature Request',
  bug: 'Bug Report',
  other: 'Other',
}

export const TICKET_PRIORITY_LABELS: Record<TicketPriority, string> = {
  low: 'Low',
  normal: 'Normal',
  high: 'High',
  critical: 'Critical',
}

export const TICKET_MESSAGE_PAGE_SIZE = 50

// Mirrors model.TicketAttachmentMaxCount / controller.MaxTicketAttachmentSize.
export const TICKET_ATTACHMENT_MAX_COUNT = 5
export const TICKET_ATTACHMENT_MAX_SIZE_BYTES = 10 * 1024 * 1024
