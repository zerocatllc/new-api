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
import type { TicketAttachmentUploadResponse } from '@/features/tickets/types'
import { api } from '@/lib/api'

import type {
  AdminCreateTicketRequest,
  AdminTicket,
  AdminTicketMessage,
  ApiResponse,
  ReplyTicketAdminRequest,
  TicketAdminListParams,
  TicketAdminListResponse,
  TicketBatchItem,
  TicketBatchResult,
  TicketSettings,
  TicketStatsResponse,
} from './types'

export async function listAllTickets(
  params: TicketAdminListParams
): Promise<ApiResponse<TicketAdminListResponse<AdminTicket>>> {
  const { tags, ...query } = params
  const res = await api.get('/api/admin/tickets/', {
    params: { ...query, tags: tags?.length ? tags.join(',') : undefined },
    skipBusinessError: true,
  })
  return res.data
}

export async function getTicketStatsAdmin(): Promise<
  ApiResponse<TicketStatsResponse>
> {
  const res = await api.get('/api/admin/tickets/stats')
  return res.data
}

export async function getTicketAdmin(
  publicId: string
): Promise<ApiResponse<AdminTicket>> {
  const res = await api.get(`/api/admin/tickets/${publicId}`)
  return res.data
}

export async function listDeletedTicketsAdmin(
  page: number,
  pageSize: number
): Promise<ApiResponse<TicketAdminListResponse<AdminTicket>>> {
  const res = await api.get('/api/admin/tickets/trash', {
    params: { p: page, page_size: pageSize },
    skipBusinessError: true,
  })
  return res.data
}

export async function deleteTicketAdmin(
  publicId: string,
  expectedVersion: number
): Promise<ApiResponse<AdminTicket>> {
  const res = await api.delete(`/api/admin/tickets/${publicId}`, {
    data: { expected_version: expectedVersion },
    skipBusinessError: true,
  })
  return res.data
}

export async function restoreTicketAdmin(
  publicId: string,
  expectedVersion: number
): Promise<ApiResponse<AdminTicket>> {
  const res = await api.post(
    `/api/admin/tickets/trash/${publicId}/restore`,
    { expected_version: expectedVersion },
    { skipBusinessError: true }
  )
  return res.data
}

export async function listTicketMessagesAdmin(
  publicId: string,
  beforeId: number | undefined,
  limit: number
): Promise<ApiResponse<AdminTicketMessage[]>> {
  const res = await api.get(`/api/admin/tickets/${publicId}/messages`, {
    params: { before_id: beforeId || undefined, limit },
  })
  return res.data
}

export async function replyTicketAdmin(
  publicId: string,
  request: ReplyTicketAdminRequest
): Promise<ApiResponse<{ ticket: AdminTicket; message: AdminTicketMessage }>> {
  const res = await api.post(
    `/api/admin/tickets/${publicId}/messages`,
    request,
    {
      skipBusinessError: true,
    }
  )
  return res.data
}

export async function markTicketReadAdmin(
  publicId: string
): Promise<ApiResponse<null>> {
  const res = await api.post(`/api/admin/tickets/${publicId}/read`)
  return res.data
}

export async function resolveTicketAdmin(
  publicId: string,
  expectedVersion: number
): Promise<ApiResponse<AdminTicket>> {
  const res = await api.post(
    `/api/admin/tickets/${publicId}/resolve`,
    { expected_version: expectedVersion },
    { skipBusinessError: true }
  )
  return res.data
}

export async function reopenTicketAdmin(
  publicId: string,
  expectedVersion: number
): Promise<ApiResponse<AdminTicket>> {
  const res = await api.post(
    `/api/admin/tickets/${publicId}/reopen`,
    { expected_version: expectedVersion },
    { skipBusinessError: true }
  )
  return res.data
}

export async function assignTicketAdmin(
  publicId: string,
  assigneeUserId: number | null,
  expectedVersion: number
): Promise<ApiResponse<AdminTicket>> {
  const res = await api.post(
    `/api/admin/tickets/${publicId}/assign`,
    { assignee_user_id: assigneeUserId, expected_version: expectedVersion },
    { skipBusinessError: true }
  )
  return res.data
}

export async function adminCreateTicket(
  request: AdminCreateTicketRequest
): Promise<ApiResponse<AdminTicket>> {
  const res = await api.post('/api/admin/tickets/', request, {
    skipBusinessError: true,
  })
  return res.data
}

export async function getTicketUnreadCountAdmin(): Promise<
  ApiResponse<{ unread_ticket_count: number }>
> {
  const res = await api.get('/api/admin/tickets/unread-count')
  return res.data
}

export async function getTicketSettings(): Promise<
  ApiResponse<TicketSettings>
> {
  const res = await api.get('/api/admin/ticket/settings/')
  return res.data
}

export async function updateTicketSettings(
  enabled: boolean,
  expectedVersion: number
): Promise<ApiResponse<TicketSettings>> {
  const res = await api.put(
    '/api/admin/ticket/settings/',
    { enabled, expected_version: expectedVersion },
    { skipBusinessError: true }
  )
  return res.data
}

export async function uploadTicketAttachmentAdmin(
  file: File
): Promise<ApiResponse<TicketAttachmentUploadResponse>> {
  const formData = new FormData()
  formData.append('file', file)
  const res = await api.post('/api/admin/tickets/upload', formData)
  return res.data
}

export function buildTicketAttachmentDownloadUrlAdmin(url: string): string {
  return `/api/admin/tickets/download?url=${encodeURIComponent(url)}`
}

export async function bulkResolveTicketsAdmin(
  items: TicketBatchItem[]
): Promise<ApiResponse<{ results: TicketBatchResult[] }>> {
  const res = await api.post(
    '/api/admin/tickets/bulk/resolve',
    { items },
    { skipBusinessError: true }
  )
  return res.data
}

export async function bulkAssignTicketsAdmin(
  items: TicketBatchItem[],
  assigneeUserId: number | null
): Promise<ApiResponse<{ results: TicketBatchResult[] }>> {
  const res = await api.post(
    '/api/admin/tickets/bulk/assign',
    { items, assignee_user_id: assigneeUserId },
    { skipBusinessError: true }
  )
  return res.data
}

export async function bulkTagTicketsAdmin(
  publicIds: string[],
  tags: string[]
): Promise<ApiResponse<{ results: TicketBatchResult[] }>> {
  const res = await api.post(
    '/api/admin/tickets/bulk/tags',
    { public_ids: publicIds, tags },
    { skipBusinessError: true }
  )
  return res.data
}

export async function addTicketTagsAdmin(
  publicId: string,
  tags: string[]
): Promise<ApiResponse<AdminTicket>> {
  const res = await api.post(
    `/api/admin/tickets/${publicId}/tags`,
    { tags },
    { skipBusinessError: true }
  )
  return res.data
}

export async function removeTicketTagAdmin(
  publicId: string,
  tag: string
): Promise<ApiResponse<AdminTicket>> {
  const res = await api.delete(
    `/api/admin/tickets/${publicId}/tags/${encodeURIComponent(tag)}`,
    { skipBusinessError: true }
  )
  return res.data
}
