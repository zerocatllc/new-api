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
import type { ApiResponse } from '../types'

type TicketDetailReload<TTicket, TMessage> = {
  ticket: TTicket
  messages: TMessage[]
}

export async function reloadTicketDetailAfterVersionConflict<TTicket, TMessage>(
  response: ApiResponse<unknown>,
  getTicket: () => Promise<ApiResponse<TTicket>>,
  listMessages: () => Promise<ApiResponse<TMessage[]>>
): Promise<TicketDetailReload<TTicket, TMessage> | null> {
  const data = response.data
  if (
    !data ||
    typeof data !== 'object' ||
    !('version_conflict' in data) ||
    data.version_conflict !== true
  ) {
    return null
  }

  const [ticketResult, messagesResult] = await Promise.all([
    getTicket(),
    listMessages(),
  ])
  if (!ticketResult.success || !ticketResult.data) {
    throw new Error(ticketResult.message || 'Failed to reload ticket')
  }
  if (!messagesResult.success || !messagesResult.data) {
    throw new Error(messagesResult.message || 'Failed to reload messages')
  }

  return {
    ticket: ticketResult.data,
    messages: [...messagesResult.data].reverse(),
  }
}
