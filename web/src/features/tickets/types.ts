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
export interface ApiResponse<T = unknown> {
  success: boolean
  message?: string
  data?: T
}

export type TicketStatus = 'open' | 'resolved'
export type TicketWaitingOn = 'staff' | 'user' | 'none'
export type TicketInitiatedBy = 'user' | 'staff'
export type TicketCategory =
  | 'general'
  | 'technical'
  | 'billing'
  | 'feature'
  | 'bug'
  | 'other'
export type TicketPriority = 'low' | 'normal' | 'high' | 'critical'
export type TicketAuthorKind = 'user' | 'staff' | 'system'
export type TicketVisibility = 'public' | 'internal'

export interface Ticket {
  public_id: string
  user_id: number
  initiated_by: TicketInitiatedBy
  subject: string
  category: TicketCategory
  priority: TicketPriority
  status: TicketStatus
  waiting_on: TicketWaitingOn
  message_count: number
  version: number
  created_at: number
  updated_at: number
  resolved_at: number | null
  deleted_at?: number | null
  deleted_by_user_id?: number
  last_message_at: number
  last_public_message_at: number
  // Populated only on the admin ticket list response (one batched query per
  // page); absent/undefined on every other endpoint.
  unread_count?: number
  username?: string
  display_name?: string
  // Populated on admin ticket list/detail responses.
  tags?: string[]
  // Populated only on GetTicketAdmin, and only when the caller holds
  // authz.TicketViewUserProfile.
  user_profile?: TicketUserProfile
}

export interface TicketUserProfile {
  quota: number
  group: string
  role: number
  status: number
}

export interface TicketCapabilities {
  enabled: boolean
  attachments_enabled: boolean
}

export interface TicketStatsResponse {
  total: number
  by_status: Record<string, number>
  queues: {
    waiting_on_staff: number
    waiting_on_user: number
    resolved: number
    unassigned: number
    assigned_to_me: number
  }
}

export interface TicketMessage {
  id: number
  author_kind: TicketAuthorKind
  visibility: TicketVisibility
  body: string
  attachment_urls?: string[]
  created_at: number
}

export interface TicketListResponse {
  items: Ticket[]
  total: number
  page: number
  page_size: number
}

export interface CreateTicketRequest {
  category: TicketCategory
  priority: TicketPriority
  subject: string
  body: string
  client_request_id: string
  attachment_urls?: string[]
}

export interface ReplyTicketRequest {
  body: string
  internal: boolean
  client_request_id: string
  attachment_urls?: string[]
}

export interface TicketAttachmentUploadResponse {
  url: string
}

export interface TicketVersionRequest {
  expected_version: number
}

export interface TicketVersionConflictData {
  version_conflict: true
}
