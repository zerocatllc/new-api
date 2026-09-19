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

export type TicketAttachmentMode = 'user' | 'admin'

export function attachmentFileName(url: string): string {
  const pathname = url.split('?')[0]
  const encoded = pathname.split('/').pop() || 'file'
  try {
    return decodeURIComponent(encoded)
  } catch {
    return encoded
  }
}

export function isTicketImage(url: string): boolean {
  return /\.(?:jpe?g|png|gif|webp)$/i.test(url.split('?')[0])
}

export function buildTicketDownloadHref(
  url: string,
  mode: TicketAttachmentMode
): string {
  const prefix = mode === 'admin' ? '/api/admin/tickets' : '/api/tickets'
  const inline = isTicketImage(url) ? '&inline=1' : ''
  return `${prefix}/download?url=${encodeURIComponent(url)}${inline}`
}

export async function fetchTicketAttachment(
  url: string,
  mode: TicketAttachmentMode,
  signal?: AbortSignal
): Promise<Blob> {
  return fetchTicketAttachmentHref(buildTicketDownloadHref(url, mode), signal)
}

export async function fetchTicketAttachmentHref(
  href: string,
  signal?: AbortSignal
): Promise<Blob> {
  const response = await api.get<{
    success: boolean
    message?: string
    data?: { url: string }
  }>(href, { signal })
  const accessPath = response.data.data?.url
  if (!response.data.success || !accessPath) {
    throw new Error(response.data.message || 'Attachment URL unavailable')
  }
  const objectResponse = await fetch(accessPath, {
    signal,
    credentials: 'same-origin',
  })
  if (!objectResponse.ok) {
    throw new Error(`Attachment download failed: ${objectResponse.status}`)
  }
  return objectResponse.blob()
}

export async function triggerTicketDownload(
  url: string,
  mode: TicketAttachmentMode
): Promise<void> {
  await triggerTicketDownloadHref(
    buildTicketDownloadHref(url, mode),
    attachmentFileName(url)
  )
}

export async function triggerTicketDownloadHref(
  href: string,
  fileName: string
): Promise<void> {
  const response = await api.get<{
    success: boolean
    message?: string
    data?: { url: string }
  }>(href)
  const accessPath = response.data.data?.url
  if (!response.data.success || !accessPath) {
    throw new Error(response.data.message || 'Attachment URL unavailable')
  }
  const anchor = document.createElement('a')
  anchor.href = accessPath
  anchor.download = fileName
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
}
