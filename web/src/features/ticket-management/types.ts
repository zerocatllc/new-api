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
import type { Ticket, TicketMessage } from '@/features/tickets/types'

export type {
  Ticket,
  TicketAuthorKind,
  TicketCategory,
  TicketMessage,
  TicketPriority,
  TicketStatsResponse,
  TicketStatus,
  TicketUserProfile,
  TicketVisibility,
} from '@/features/tickets/types'

// Admin responses are not redacted the way owner-facing responses are, so the
// staff-only fields live on these extended shapes instead of the shared types.
export interface AdminTicket extends Ticket {
  assigned_to: number | null
}

export interface AdminTicketMessage extends TicketMessage {
  author_user_id: number
}

export interface ApiResponse<T = unknown> {
  success: boolean
  message?: string
  data?: T
}

export interface TicketAdminListResponse<TTicket> {
  items: TTicket[]
  total: number
  page: number
  page_size: number
}

export interface TicketAdminListParams {
  p: number
  page_size: number
  status?: string
  category?: string
  priority?: string
  keyword?: string
  assigned_to?: number
  tags?: string[]
}

export interface AdminCreateTicketRequest {
  user_id: number
  category: string
  priority: string
  subject: string
  body: string
  client_request_id: string
  attachment_urls?: string[]
}

export interface ReplyTicketAdminRequest {
  body: string
  internal: boolean
  client_request_id: string
  attachment_urls?: string[]
}

export interface TicketSettings {
  version: number
  enabled: boolean
}

export interface TicketBatchItem {
  public_id: string
  expected_version: number
}

export interface TicketBatchResult {
  public_id: string
  success: boolean
  error?: string
  version_conflict?: boolean
}
