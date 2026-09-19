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
import { api } from '@/lib/api'

import type {
  ApiResponse,
  CreateTicketRequest,
  ReplyTicketRequest,
  Ticket,
  TicketAttachmentUploadResponse,
  TicketCapabilities,
  TicketListResponse,
  TicketMessage,
  TicketStatsResponse,
  TicketVersionRequest,
} from './types'

export interface MyTicketListFilter {
  status?: string
  category?: string
  priority?: string
  keyword?: string
}

export async function listMyTickets(
  page: number,
  pageSize: number,
  filter: MyTicketListFilter = {}
): Promise<ApiResponse<TicketListResponse>> {
  const res = await api.get('/api/tickets/', {
    params: {
      p: page,
      page_size: pageSize,
      status: filter.status || undefined,
      category: filter.category || undefined,
      priority: filter.priority || undefined,
      keyword: filter.keyword || undefined,
    },
    skipBusinessError: true,
  })
  return res.data
}

export async function getMyTicketStats(): Promise<
  ApiResponse<TicketStatsResponse>
> {
  const res = await api.get('/api/tickets/stats')
  return res.data
}

export async function getTicketCapabilities(): Promise<
  ApiResponse<TicketCapabilities>
> {
  const res = await api.get('/api/tickets/capabilities')
  return res.data
}

export async function getMyTicket(
  publicId: string
): Promise<ApiResponse<Ticket>> {
  const res = await api.get(`/api/tickets/${publicId}`)
  return res.data
}

export async function listMyTicketMessages(
  publicId: string,
  beforeId: number | undefined,
  limit: number
): Promise<ApiResponse<TicketMessage[]>> {
  const res = await api.get(`/api/tickets/${publicId}/messages`, {
    params: { before_id: beforeId || undefined, limit },
  })
  return res.data
}

export async function createTicket(
  request: CreateTicketRequest
): Promise<ApiResponse<Ticket>> {
  const res = await api.post('/api/tickets/', request, {
    skipBusinessError: true,
  })
  return res.data
}

export async function replyMyTicket(
  publicId: string,
  request: ReplyTicketRequest
): Promise<ApiResponse<{ ticket: Ticket; message: TicketMessage }>> {
  const res = await api.post(`/api/tickets/${publicId}/messages`, request, {
    skipBusinessError: true,
  })
  return res.data
}

export async function markMyTicketRead(
  publicId: string
): Promise<ApiResponse<null>> {
  const res = await api.post(`/api/tickets/${publicId}/read`)
  return res.data
}

export async function resolveMyTicket(
  publicId: string,
  request: TicketVersionRequest
): Promise<ApiResponse<Ticket>> {
  const res = await api.post(`/api/tickets/${publicId}/resolve`, request, {
    skipBusinessError: true,
  })
  return res.data
}

export async function reopenMyTicket(
  publicId: string,
  request: TicketVersionRequest
): Promise<ApiResponse<Ticket>> {
  const res = await api.post(`/api/tickets/${publicId}/reopen`, request, {
    skipBusinessError: true,
  })
  return res.data
}

export async function getMyTicketUnreadCount(): Promise<
  ApiResponse<{ unread_ticket_count: number }>
> {
  const res = await api.get('/api/tickets/unread-count')
  return res.data
}

export async function uploadMyTicketAttachment(
  file: File
): Promise<ApiResponse<TicketAttachmentUploadResponse>> {
  const formData = new FormData()
  formData.append('file', file)
  const res = await api.post('/api/tickets/upload', formData)
  return res.data
}

export function buildMyTicketAttachmentDownloadUrl(url: string): string {
  return `/api/tickets/download?url=${encodeURIComponent(url)}`
}
