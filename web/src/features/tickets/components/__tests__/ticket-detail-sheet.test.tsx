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
  QueryClient,
  QueryClientProvider,
  useQuery,
} from '@tanstack/react-query'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ticketQueryKeys } from '../../lib/ticket-query-keys'
import type { ApiResponse, Ticket, TicketMessage } from '../../types'
import { TicketDetailSheet } from '../ticket-detail-sheet'
import { TicketsProvider } from '../tickets-provider'

const apiMocks = vi.hoisted(() => ({
  getMyTicket: vi.fn(),
  listMyTicketMessages: vi.fn(),
  markMyTicketRead: vi.fn(),
  replyMyTicket: vi.fn(),
  resolveMyTicket: vi.fn(),
  uploadMyTicketAttachment: vi.fn(),
  getTicketCapabilities: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}))

vi.mock('sonner', () => ({
  toast: { error: apiMocks.toastError, success: apiMocks.toastSuccess },
}))

vi.mock('@/features/tickets/api', () => ({
  buildMyTicketAttachmentDownloadUrl: (url: string) => url,
  getMyTicket: apiMocks.getMyTicket,
  listMyTicketMessages: apiMocks.listMyTicketMessages,
  markMyTicketRead: apiMocks.markMyTicketRead,
  replyMyTicket: apiMocks.replyMyTicket,
  resolveMyTicket: apiMocks.resolveMyTicket,
  uploadMyTicketAttachment: apiMocks.uploadMyTicketAttachment,
  getTicketCapabilities: apiMocks.getTicketCapabilities,
  listMyTickets: vi.fn(),
}))

vi.mock('@/features/tickets/components/ticket-attachment-field', () => ({
  TicketAttachmentField: (props: {
    urls: string[]
    onChange: (urls: string[]) => void
    disabled?: boolean
  }) => (
    <div>
      <button
        type='button'
        onClick={() => props.onChange(['https://cdn.example/draft.png'])}
      >
        stub-add-attachment
      </button>
      <span data-testid='attachment-urls'>{props.urls.join(',')}</span>
    </div>
  ),
}))

function makeTicket(publicId: string, subject: string): Ticket {
  return {
    public_id: publicId,
    user_id: 7,
    initiated_by: 'user',
    subject,
    category: 'billing',
    priority: 'normal',
    status: 'open',
    waiting_on: 'staff',
    message_count: 1,
    version: 3,
    created_at: 1,
    updated_at: 2,
    resolved_at: null,
    last_message_at: 2,
    last_public_message_at: 2,
  }
}

function makeMessage(id: number, body: string): TicketMessage {
  return {
    id,
    author_kind: 'user',
    visibility: 'public',
    body,
    created_at: 1,
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

function rejected<T>(error: Error): Promise<T> {
  const promise = Promise.reject<T>(error)
  promise.catch(() => undefined)
  return promise
}

const ticketA = makeTicket('ticket-a', 'Ticket Alpha')
const ticketB = makeTicket('ticket-b', 'Ticket Beta')

function UnreadQueryProbe(props: {
  fetchUser: () => Promise<string>
  fetchAdmin: () => Promise<string>
}) {
  useQuery({ queryKey: ticketQueryKeys.userUnread, queryFn: props.fetchUser })
  useQuery({ queryKey: ticketQueryKeys.adminUnread, queryFn: props.fetchAdmin })
  return null
}

function renderSheet(
  ticketSummary: Ticket,
  unreadFetchers?: {
    fetchUser: () => Promise<string>
    fetchAdmin: () => Promise<string>
  }
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const view = render(
    <QueryClientProvider client={queryClient}>
      {unreadFetchers && <UnreadQueryProbe {...unreadFetchers} />}
      <TicketsProvider>
        <TicketDetailSheet
          open
          onOpenChange={() => undefined}
          ticketSummary={ticketSummary}
        />
      </TicketsProvider>
    </QueryClientProvider>
  )
  const rerenderWith = (nextSummary: Ticket) =>
    view.rerender(
      <QueryClientProvider client={queryClient}>
        {unreadFetchers && <UnreadQueryProbe {...unreadFetchers} />}
        <TicketsProvider>
          <TicketDetailSheet
            open
            onOpenChange={() => undefined}
            ticketSummary={nextSummary}
          />
        </TicketsProvider>
      </QueryClientProvider>
    )
  return { ...view, rerenderWith }
}

function mockTicketResponses(
  responses: Record<string, Promise<ApiResponse<Ticket>>>,
  messages: Record<string, Promise<ApiResponse<TicketMessage[]>>>
) {
  apiMocks.getMyTicket.mockImplementation(
    (publicId: string) => responses[publicId]
  )
  apiMocks.listMyTicketMessages.mockImplementation(
    (publicId: string) => messages[publicId]
  )
}

describe('ticket detail sheet cross-ticket state', () => {
  beforeEach(() => {
    apiMocks.getMyTicket.mockReset()
    apiMocks.listMyTicketMessages.mockReset()
    apiMocks.markMyTicketRead.mockReset()
    apiMocks.getTicketCapabilities.mockReset()
    apiMocks.resolveMyTicket.mockReset()
    apiMocks.toastError.mockReset()
    apiMocks.toastSuccess.mockReset()
    apiMocks.markMyTicketRead.mockResolvedValue({ success: true })
    apiMocks.getTicketCapabilities.mockResolvedValue({
      success: true,
      data: { enabled: true, attachments_enabled: true },
    })
  })

  it('clears the previous ticket, drafts, and attachments and disables actions while the next ticket is loading', async () => {
    const pendingB = deferred<ApiResponse<Ticket>>()
    const pendingBMessages = deferred<ApiResponse<TicketMessage[]>>()
    mockTicketResponses(
      {
        'ticket-a': Promise.resolve({ success: true, data: ticketA }),
        'ticket-b': pendingB.promise,
      },
      {
        'ticket-a': Promise.resolve({
          success: true,
          data: [makeMessage(1, 'hello from alpha')],
        }),
        'ticket-b': pendingBMessages.promise,
      }
    )
    const user = userEvent.setup()
    const { rerenderWith } = renderSheet(ticketA)

    expect(await screen.findByText('hello from alpha')).toBeVisible()
    const composer = screen.getByPlaceholderText('Write a reply...')
    await user.type(composer, 'draft for alpha')
    await user.click(
      screen.getByRole('button', { name: 'stub-add-attachment' })
    )
    expect(screen.getByTestId('attachment-urls')).toHaveTextContent(
      'https://cdn.example/draft.png'
    )

    rerenderWith(ticketB)

    expect(screen.queryByText('hello from alpha')).not.toBeInTheDocument()
    expect(screen.queryByText('Ticket Alpha')).not.toBeInTheDocument()
    expect(screen.getByText('Ticket Beta')).toBeVisible()
    expect(screen.getByPlaceholderText('Write a reply...')).toHaveValue('')
    expect(screen.getByPlaceholderText('Write a reply...')).toBeDisabled()
    expect(screen.getByTestId('attachment-urls')).toHaveTextContent(/^$/)
    expect(screen.getByRole('button', { name: /Send Reply/ })).toBeDisabled()
    expect(
      screen.queryByRole('button', { name: 'Mark as resolved' })
    ).not.toBeInTheDocument()
  })

  it('shows an error state with retry instead of the previous ticket when the next ticket fails to load', async () => {
    mockTicketResponses(
      {
        'ticket-a': Promise.resolve({ success: true, data: ticketA }),
        'ticket-b': rejected(new Error('detail unavailable')),
      },
      {
        'ticket-a': Promise.resolve({
          success: true,
          data: [makeMessage(1, 'hello from alpha')],
        }),
        'ticket-b': Promise.resolve({ success: true, data: [] }),
      }
    )
    const user = userEvent.setup()
    const { rerenderWith } = renderSheet(ticketA)
    expect(await screen.findByText('hello from alpha')).toBeVisible()

    rerenderWith(ticketB)

    expect(
      await screen.findByText('Failed to load ticket details')
    ).toBeVisible()
    expect(screen.queryByText('Ticket Alpha')).not.toBeInTheDocument()
    expect(screen.queryByText('hello from alpha')).not.toBeInTheDocument()
    expect(screen.getByPlaceholderText('Write a reply...')).toBeDisabled()
    expect(screen.getByRole('button', { name: /Send Reply/ })).toBeDisabled()

    mockTicketResponses(
      {
        'ticket-b': Promise.resolve({ success: true, data: ticketB }),
      },
      {
        'ticket-b': Promise.resolve({
          success: true,
          data: [makeMessage(2, 'hello from beta')],
        }),
      }
    )
    await user.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await screen.findByText('hello from beta')).toBeVisible()
    expect(
      screen.queryByText('Failed to load ticket details')
    ).not.toBeInTheDocument()
  })

  it('ignores a late response for the previous ticket after switching to another ticket', async () => {
    const lateA = deferred<ApiResponse<Ticket>>()
    const lateAMessages = deferred<ApiResponse<TicketMessage[]>>()
    mockTicketResponses(
      {
        'ticket-a': lateA.promise,
        'ticket-b': Promise.resolve({ success: true, data: ticketB }),
      },
      {
        'ticket-a': lateAMessages.promise,
        'ticket-b': Promise.resolve({
          success: true,
          data: [makeMessage(2, 'hello from beta')],
        }),
      }
    )
    const { rerenderWith } = renderSheet(ticketA)

    rerenderWith(ticketB)
    expect(await screen.findByText('hello from beta')).toBeVisible()

    await act(async () => {
      lateA.resolve({ success: true, data: ticketA })
      lateAMessages.resolve({
        success: true,
        data: [makeMessage(1, 'hello from alpha')],
      })
      await Promise.resolve()
    })

    await waitFor(() => {
      expect(screen.queryByText('hello from alpha')).not.toBeInTheDocument()
    })
    expect(screen.queryByText('Ticket Alpha')).not.toBeInTheDocument()
    expect(screen.getByText('hello from beta')).toBeVisible()
    expect(screen.getByText('Ticket Beta')).toBeVisible()
  })

  it('ignores a late resolve response after switching to another ticket', async () => {
    const lateResolve = deferred<ApiResponse<Ticket>>()
    mockTicketResponses(
      {
        'ticket-a': Promise.resolve({ success: true, data: ticketA }),
        'ticket-b': Promise.resolve({ success: true, data: ticketB }),
      },
      {
        'ticket-a': Promise.resolve({
          success: true,
          data: [makeMessage(1, 'hello from alpha')],
        }),
        'ticket-b': Promise.resolve({
          success: true,
          data: [makeMessage(2, 'hello from beta')],
        }),
      }
    )
    apiMocks.resolveMyTicket.mockReturnValue(lateResolve.promise)
    const user = userEvent.setup()
    const { rerenderWith } = renderSheet(ticketA)

    await user.click(
      await screen.findByRole('button', { name: 'Mark as resolved' })
    )
    rerenderWith(ticketB)
    expect(await screen.findByText('hello from beta')).toBeVisible()

    await act(async () => {
      lateResolve.resolve({
        success: true,
        data: { ...ticketA, status: 'resolved' },
      })
      await Promise.resolve()
    })

    expect(screen.getByText('Ticket Beta')).toBeVisible()
    expect(screen.getByText('hello from beta')).toBeVisible()
    expect(screen.queryByText('Ticket Alpha')).not.toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Mark as resolved' })
    ).toBeEnabled()
  })

  it('ignores late older messages after switching to another ticket', async () => {
    const lateOlder = deferred<ApiResponse<TicketMessage[]>>()
    apiMocks.getMyTicket.mockImplementation((publicId: string) =>
      Promise.resolve({
        success: true,
        data: publicId === 'ticket-a' ? ticketA : ticketB,
      })
    )
    apiMocks.listMyTicketMessages.mockImplementation(
      (publicId: string, beforeId?: number) => {
        if (publicId === 'ticket-a' && beforeId !== undefined) {
          return lateOlder.promise
        }
        const count = publicId === 'ticket-a' ? 50 : 1
        return Promise.resolve({
          success: true,
          data: Array.from({ length: count }, (_, index) =>
            makeMessage(index + 1, `${publicId} message ${index + 1}`)
          ),
        })
      }
    )
    const user = userEvent.setup()
    const { rerenderWith } = renderSheet(ticketA)

    await user.click(
      await screen.findByRole('button', { name: 'Load older messages' })
    )
    rerenderWith(ticketB)
    expect(await screen.findByText('ticket-b message 1')).toBeVisible()

    await act(async () => {
      lateOlder.resolve({
        success: true,
        data: [makeMessage(100, 'late alpha history')],
      })
      await Promise.resolve()
    })

    expect(screen.queryByText('late alpha history')).not.toBeInTheDocument()
    expect(screen.getByText('Ticket Beta')).toBeVisible()
  })

  it('reports a conflict reload failure without claiming the ticket was refreshed', async () => {
    apiMocks.getMyTicket
      .mockResolvedValueOnce({ success: true, data: ticketA })
      .mockRejectedValueOnce(new Error('reload unavailable'))
    apiMocks.listMyTicketMessages.mockResolvedValue({
      success: true,
      data: [makeMessage(1, 'hello from alpha')],
    })
    apiMocks.resolveMyTicket.mockResolvedValue({
      success: false,
      message: 'version conflict',
      data: { version_conflict: true },
    })
    const user = userEvent.setup()
    renderSheet(ticketA)

    await user.click(
      await screen.findByRole('button', { name: 'Mark as resolved' })
    )

    await waitFor(() =>
      expect(apiMocks.toastError).toHaveBeenCalledWith(
        'Failed to load ticket details'
      )
    )
    expect(apiMocks.toastError).not.toHaveBeenCalledWith(
      'Ticket changed. Latest details were loaded; review them and try again.'
    )
  })

  it('refreshes only the user unread query after marking a ticket read', async () => {
    mockTicketResponses(
      { 'ticket-a': Promise.resolve({ success: true, data: ticketA }) },
      {
        'ticket-a': Promise.resolve({
          success: true,
          data: [makeMessage(1, 'hello from alpha')],
        }),
      }
    )
    const fetchUser = vi.fn().mockResolvedValue('user')
    const fetchAdmin = vi.fn().mockResolvedValue('admin')

    renderSheet(ticketA, { fetchUser, fetchAdmin })

    await screen.findByText('hello from alpha')
    await waitFor(() => expect(fetchUser).toHaveBeenCalledTimes(2))
    expect(fetchAdmin).toHaveBeenCalledTimes(1)
  })
})
