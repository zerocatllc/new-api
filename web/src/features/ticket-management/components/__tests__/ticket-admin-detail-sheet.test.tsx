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

import { ticketQueryKeys } from '@/features/tickets/lib/ticket-query-keys'

import type { AdminTicket, AdminTicketMessage } from '../../types'
import { TicketAdminDetailSheet } from '../ticket-admin-detail-sheet'
import { TicketManagementProvider } from '../ticket-management-provider'

const apiMocks = vi.hoisted(() => ({
  getTicketAdmin: vi.fn(),
  listTicketMessagesAdmin: vi.fn(),
  markTicketReadAdmin: vi.fn(),
  resolveTicketAdmin: vi.fn(),
}))

vi.mock('@/features/ticket-management/api', () => ({
  assignTicketAdmin: vi.fn(),
  addTicketTagsAdmin: vi.fn(),
  buildTicketAttachmentDownloadUrlAdmin: (url: string) => url,
  deleteTicketAdmin: vi.fn(),
  getTicketAdmin: apiMocks.getTicketAdmin,
  listTicketMessagesAdmin: apiMocks.listTicketMessagesAdmin,
  markTicketReadAdmin: apiMocks.markTicketReadAdmin,
  replyTicketAdmin: vi.fn(),
  reopenTicketAdmin: vi.fn(),
  resolveTicketAdmin: apiMocks.resolveTicketAdmin,
  removeTicketTagAdmin: vi.fn(),
  uploadTicketAttachmentAdmin: vi.fn(),
}))

vi.mock('@/features/ticket-management/ticket-permissions', () => ({
  getTicketPermissions: () => ({
    canRead: true,
    canReply: true,
    canManage: true,
    canWriteSettings: true,
    canDelete: true,
  }),
}))

vi.mock(
  '@/features/ticket-management/components/staff-assignee-picker',
  () => ({
    StaffAssigneePicker: (props: {
      value: number | null
      disabled?: boolean
    }) => <span data-testid='assignee-value'>{String(props.value)}</span>,
  })
)

vi.mock('@/features/tickets/components/ticket-attachment-field', () => ({
  TicketAttachmentField: (props: { urls: string[] }) => (
    <span data-testid='attachment-urls'>{props.urls.join(',')}</span>
  ),
}))

function makeTicket(
  publicId: string,
  subject: string,
  assignedTo: number | null,
  tags: string[]
): AdminTicket {
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
    assigned_to: assignedTo,
    tags,
  }
}

function makeMessage(id: number, body: string): AdminTicketMessage {
  return {
    id,
    author_kind: 'user',
    visibility: 'public',
    body,
    created_at: 1,
    author_user_id: 7,
  }
}

const ticketA = makeTicket('ticket-a', 'Ticket Alpha', 42, ['vip'])
const ticketB = makeTicket('ticket-b', 'Ticket Beta', null, [])

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

function UnreadQueryProbe(props: {
  fetchUser: () => Promise<string>
  fetchAdmin: () => Promise<string>
}) {
  useQuery({ queryKey: ticketQueryKeys.userUnread, queryFn: props.fetchUser })
  useQuery({ queryKey: ticketQueryKeys.adminUnread, queryFn: props.fetchAdmin })
  return null
}

function renderSheet(
  ticketSummary: AdminTicket,
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
      <TicketManagementProvider>
        <TicketAdminDetailSheet
          open
          onOpenChange={() => undefined}
          ticketSummary={ticketSummary}
        />
      </TicketManagementProvider>
    </QueryClientProvider>
  )
  const rerenderWith = (nextSummary: AdminTicket) =>
    view.rerender(
      <QueryClientProvider client={queryClient}>
        {unreadFetchers && <UnreadQueryProbe {...unreadFetchers} />}
        <TicketManagementProvider>
          <TicketAdminDetailSheet
            open
            onOpenChange={() => undefined}
            ticketSummary={nextSummary}
          />
        </TicketManagementProvider>
      </QueryClientProvider>
    )
  return { ...view, rerenderWith }
}

describe('ticket admin detail sheet cross-ticket state', () => {
  beforeEach(() => {
    apiMocks.getTicketAdmin.mockReset()
    apiMocks.listTicketMessagesAdmin.mockReset()
    apiMocks.markTicketReadAdmin.mockReset()
    apiMocks.resolveTicketAdmin.mockReset()
    apiMocks.markTicketReadAdmin.mockResolvedValue({ success: true })
  })

  it('clears assignee selection, tag draft, and tags and disables admin actions while the next ticket is loading', async () => {
    apiMocks.getTicketAdmin.mockImplementation((publicId: string) => {
      if (publicId === 'ticket-a') {
        return Promise.resolve({ success: true, data: ticketA })
      }
      return new Promise(() => undefined)
    })
    apiMocks.listTicketMessagesAdmin.mockImplementation((publicId: string) => {
      if (publicId === 'ticket-a') {
        return Promise.resolve({
          success: true,
          data: [makeMessage(1, 'hello from alpha')],
        })
      }
      return new Promise(() => undefined)
    })
    const user = userEvent.setup()
    const { rerenderWith } = renderSheet(ticketA)

    expect(await screen.findByText('hello from alpha')).toBeVisible()
    expect(screen.getByTestId('assignee-value')).toHaveTextContent('42')
    expect(screen.getByText('vip')).toBeVisible()
    const tagInput = screen.getByPlaceholderText('Add tag')
    await user.type(tagInput, 'urgent')
    const composer = screen.getByPlaceholderText('Write a reply...')
    await user.type(composer, 'draft for alpha')
    await user.click(screen.getByRole('switch'))
    expect(
      screen.getByPlaceholderText('Write an internal note...')
    ).toBeVisible()

    rerenderWith(ticketB)

    expect(screen.getByTestId('assignee-value')).toHaveTextContent('null')
    expect(
      screen.queryByPlaceholderText('Write an internal note...')
    ).not.toBeInTheDocument()
    expect(screen.getByRole('switch')).not.toBeChecked()
    expect(screen.getByPlaceholderText('Add tag')).toHaveValue('')
    expect(screen.getByPlaceholderText('Add tag')).toBeDisabled()
    expect(screen.queryByText('vip')).not.toBeInTheDocument()
    expect(screen.getByPlaceholderText('Write a reply...')).toHaveValue('')
    expect(screen.getByPlaceholderText('Write a reply...')).toBeDisabled()
    expect(screen.queryByText('hello from alpha')).not.toBeInTheDocument()
    expect(screen.queryByText('Ticket Alpha')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add tag' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
    expect(screen.getByRole('button', { name: /Delete ticket/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: /Send/ })).toBeDisabled()
  })

  it('shows an error state with retry and keeps admin actions disabled when the ticket fails to load', async () => {
    apiMocks.getTicketAdmin.mockRejectedValue(new Error('detail unavailable'))
    apiMocks.listTicketMessagesAdmin.mockResolvedValue({
      success: true,
      data: [],
    })
    renderSheet(ticketB)

    expect(
      await screen.findByText('Failed to load ticket details')
    ).toBeVisible()
    expect(screen.getByRole('button', { name: 'Retry' })).toBeEnabled()
    expect(screen.getByPlaceholderText('Write a reply...')).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
    expect(screen.getByRole('button', { name: /Delete ticket/ })).toBeDisabled()
  })

  it('ignores a late resolve response after switching to another ticket', async () => {
    apiMocks.getTicketAdmin.mockImplementation((publicId: string) =>
      Promise.resolve({
        success: true,
        data: publicId === 'ticket-a' ? ticketA : ticketB,
      })
    )
    apiMocks.listTicketMessagesAdmin.mockImplementation((publicId: string) =>
      Promise.resolve({
        success: true,
        data: [
          publicId === 'ticket-a'
            ? makeMessage(1, 'hello from alpha')
            : makeMessage(2, 'hello from beta'),
        ],
      })
    )
    const lateResolve = deferred<{
      success: boolean
      data: AdminTicket
    }>()
    apiMocks.resolveTicketAdmin.mockReturnValue(lateResolve.promise)
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

  it('refreshes only the admin unread query after marking a ticket read', async () => {
    apiMocks.getTicketAdmin.mockResolvedValue({ success: true, data: ticketA })
    apiMocks.listTicketMessagesAdmin.mockResolvedValue({
      success: true,
      data: [makeMessage(1, 'hello from alpha')],
    })
    const fetchUser = vi.fn().mockResolvedValue('user')
    const fetchAdmin = vi.fn().mockResolvedValue('admin')

    renderSheet(ticketA, { fetchUser, fetchAdmin })

    await screen.findByText('hello from alpha')
    await waitFor(() => expect(fetchAdmin).toHaveBeenCalledTimes(2))
    expect(fetchUser).toHaveBeenCalledTimes(1)
  })
})
