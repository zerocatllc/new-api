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
import { useQueryClient } from '@tanstack/react-query'
import { Plus, Send, Trash2, X } from 'lucide-react'
import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { StatusBadge } from '@/components/status-badge'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import {
  TicketAttachmentField,
  type TicketAttachmentFieldHandle,
} from '@/features/tickets/components/ticket-attachment-field'
import { TicketAttachments } from '@/features/tickets/components/ticket-attachments'
import { canSubmitTicketMessage } from '@/features/tickets/lib/ticket-composer'
import { ticketQueryKeys } from '@/features/tickets/lib/ticket-query-keys'
import { reloadTicketDetailAfterVersionConflict } from '@/features/tickets/lib/ticket-version-conflict'
import {
  useTicketDetailFreshness,
  type TicketDetailFreshnessToken,
} from '@/features/tickets/lib/use-ticket-detail-freshness'
import { formatTimestampToDate } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/auth-store'

import {
  assignTicketAdmin,
  addTicketTagsAdmin,
  buildTicketAttachmentDownloadUrlAdmin,
  deleteTicketAdmin,
  getTicketAdmin,
  listTicketMessagesAdmin,
  markTicketReadAdmin,
  replyTicketAdmin,
  reopenTicketAdmin,
  resolveTicketAdmin,
  removeTicketTagAdmin,
  uploadTicketAttachmentAdmin,
} from '../api'
import { TICKET_CATEGORY_LABELS, TICKET_MESSAGE_PAGE_SIZE } from '../constants'
import { getTicketPermissions } from '../ticket-permissions'
import type { AdminTicket, AdminTicketMessage, ApiResponse } from '../types'
import { StaffAssigneePicker } from './staff-assignee-picker'
import { TicketDeleteConfirmation } from './ticket-delete-confirmation'
import { useTicketManagement } from './ticket-management-provider'
import { TicketUserProfileCard } from './ticket-user-profile-card'

type TicketAdminDetailSheetProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  ticketSummary: AdminTicket | null
}

export function TicketAdminDetailSheet({
  open,
  onOpenChange,
  ticketSummary,
}: TicketAdminDetailSheetProps) {
  const { t } = useTranslation()
  const { triggerRefresh } = useTicketManagement()
  const queryClient = useQueryClient()
  const currentUser = useAuthStore((state) => state.auth.user)
  const { canReply, canManage, canDelete } = getTicketPermissions(currentUser)

  const [ticket, setTicket] = useState<AdminTicket | null>(null)
  const [messages, setMessages] = useState<AdminTicketMessage[]>([])
  const [hasMoreOlder, setHasMoreOlder] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [isLoadingOlder, setIsLoadingOlder] = useState(false)
  const [replyBody, setReplyBody] = useState('')
  const [attachmentUrls, setAttachmentUrls] = useState<string[]>([])
  const [internal, setInternal] = useState(false)
  const [isReplying, setIsReplying] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [isTransitioning, setIsTransitioning] = useState(false)
  const [assigneeUserId, setAssigneeUserId] = useState<number | null>(null)
  const [tagDraft, setTagDraft] = useState('')
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [loadError, setLoadError] = useState(false)
  const [reloadToken, setReloadToken] = useState(0)
  const attachmentFieldRef = useRef<TicketAttachmentFieldHandle>(null)
  const {
    activate: activateFreshness,
    capture: captureFreshness,
    invalidate: invalidateFreshness,
    isCurrent: isFresh,
  } = useTicketDetailFreshness()
  const replyPlaceholder = internal
    ? t('Write an internal note...')
    : t('Write a reply...')

  const refreshAfterVersionConflict = async (
    result: ApiResponse<unknown>,
    token: TicketDetailFreshnessToken,
    refreshStats: boolean
  ) => {
    let refreshed
    try {
      refreshed = await reloadTicketDetailAfterVersionConflict(
        result,
        () => getTicketAdmin(token.publicId),
        () =>
          listTicketMessagesAdmin(
            token.publicId,
            undefined,
            TICKET_MESSAGE_PAGE_SIZE
          )
      )
    } catch {
      if (isFresh(token)) toast.error(t('Failed to load ticket details'))
      return true
    }
    if (!isFresh(token)) return true
    if (!refreshed) return false
    setTicket(refreshed.ticket)
    setAssigneeUserId(refreshed.ticket.assigned_to)
    setMessages(refreshed.messages)
    setHasMoreOlder(refreshed.messages.length === TICKET_MESSAGE_PAGE_SIZE)
    triggerRefresh({ stats: refreshStats })
    toast.error(
      t(
        'Ticket changed. Latest details were loaded; review them and try again.'
      )
    )
    return true
  }

  useEffect(() => {
    if (!open || !ticketSummary) {
      invalidateFreshness()
      return
    }
    const publicId = ticketSummary.public_id
    const token = activateFreshness(publicId)

    setTicket(null)
    setMessages([])
    setHasMoreOlder(false)
    setReplyBody('')
    setAttachmentUrls([])
    setInternal(false)
    setAssigneeUserId(null)
    setTagDraft('')
    setDeleteConfirmOpen(false)
    setIsLoadingOlder(false)
    setIsReplying(false)
    setIsTransitioning(false)
    setIsDeleting(false)
    setLoadError(false)
    setIsLoading(true)

    async function load() {
      let loadedTicket: AdminTicket | null = null
      let loadedMessages: AdminTicketMessage[] | null = null
      try {
        const [ticketResult, messagesResult] = await Promise.all([
          getTicketAdmin(publicId),
          listTicketMessagesAdmin(
            publicId,
            undefined,
            TICKET_MESSAGE_PAGE_SIZE
          ),
        ])
        if (ticketResult.success && ticketResult.data) {
          loadedTicket = ticketResult.data
        }
        if (messagesResult.success && messagesResult.data) {
          loadedMessages = messagesResult.data
        }
      } catch {
        loadedTicket = null
      }
      if (!isFresh(token)) return
      if (!loadedTicket || !loadedMessages) {
        setLoadError(true)
        setIsLoading(false)
        return
      }
      setTicket(loadedTicket)
      setAssigneeUserId(loadedTicket.assigned_to)
      const ascending = [...loadedMessages].reverse()
      setMessages(ascending)
      setHasMoreOlder(loadedMessages.length === TICKET_MESSAGE_PAGE_SIZE)
      setIsLoading(false)
      try {
        await markTicketReadAdmin(publicId)
      } catch {
        return
      }
      if (!isFresh(token)) return
      triggerRefresh()
      await queryClient.invalidateQueries({
        queryKey: ticketQueryKeys.adminUnread,
      })
    }

    void load()
    return () => {
      invalidateFreshness()
    }
  }, [
    activateFreshness,
    invalidateFreshness,
    isFresh,
    open,
    queryClient,
    reloadToken,
    ticketSummary,
    triggerRefresh,
  ])

  const loadOlderMessages = async () => {
    if (!ticket || messages.length === 0) return
    const token = captureFreshness(ticket.public_id)
    if (!token) return
    setIsLoadingOlder(true)
    try {
      const oldestId = messages[0].id
      const result = await listTicketMessagesAdmin(
        ticket.public_id,
        oldestId,
        TICKET_MESSAGE_PAGE_SIZE
      )
      if (isFresh(token) && result.success && result.data) {
        const ascending = [...result.data].reverse()
        setMessages((prev) => [...ascending, ...prev])
        setHasMoreOlder(result.data.length === TICKET_MESSAGE_PAGE_SIZE)
      }
    } finally {
      if (isFresh(token)) setIsLoadingOlder(false)
    }
  }

  const handleReply = async () => {
    if (
      !ticket ||
      !canSubmitTicketMessage(
        replyBody,
        attachmentUrls.length,
        isUploading,
        isReplying
      )
    ) {
      return
    }
    const token = captureFreshness(ticket.public_id)
    if (!token) return
    setIsReplying(true)
    try {
      const result = await replyTicketAdmin(ticket.public_id, {
        body: replyBody.trim(),
        internal,
        client_request_id: crypto.randomUUID(),
        attachment_urls: attachmentUrls.length ? attachmentUrls : undefined,
      })
      if (!isFresh(token)) return
      if (result.success && result.data) {
        const response = result.data
        setTicket(response.ticket)
        setMessages((prev) => [...prev, response.message])
        setReplyBody('')
        setAttachmentUrls([])
        triggerRefresh({ stats: true })
      } else {
        toast.error(result.message || t('Failed to send reply'))
      }
    } finally {
      if (isFresh(token)) setIsReplying(false)
    }
  }

  const handleResolve = async () => {
    if (!ticket) return
    const token = captureFreshness(ticket.public_id)
    if (!token) return
    setIsTransitioning(true)
    try {
      const result = await resolveTicketAdmin(ticket.public_id, ticket.version)
      if (!isFresh(token)) return
      if (result.success && result.data) {
        setTicket(result.data)
        toast.success(t('Ticket resolved'))
        triggerRefresh({ stats: true })
      } else {
        if (!(await refreshAfterVersionConflict(result, token, true))) {
          toast.error(
            result.message || t('Failed to resolve ticket, please reload')
          )
        }
      }
    } finally {
      if (isFresh(token)) setIsTransitioning(false)
    }
  }

  const handleReopen = async () => {
    if (!ticket) return
    const token = captureFreshness(ticket.public_id)
    if (!token) return
    setIsTransitioning(true)
    try {
      const result = await reopenTicketAdmin(ticket.public_id, ticket.version)
      if (!isFresh(token)) return
      if (result.success && result.data) {
        setTicket(result.data)
        toast.success(t('Ticket reopened'))
        triggerRefresh({ stats: true })
      } else {
        if (!(await refreshAfterVersionConflict(result, token, true))) {
          toast.error(
            result.message || t('Failed to reopen ticket, please reload')
          )
        }
      }
    } finally {
      if (isFresh(token)) setIsTransitioning(false)
    }
  }

  const handleAssign = async () => {
    if (!ticket) return
    const token = captureFreshness(ticket.public_id)
    if (!token) return
    setIsTransitioning(true)
    try {
      const result = await assignTicketAdmin(
        ticket.public_id,
        assigneeUserId,
        ticket.version
      )
      if (!isFresh(token)) return
      if (result.success && result.data) {
        setTicket(result.data)
        toast.success(t('Assignment updated'))
        triggerRefresh({ stats: true })
      } else {
        if (!(await refreshAfterVersionConflict(result, token, true))) {
          toast.error(
            result.message || t('Failed to update assignment, please reload')
          )
        }
      }
    } finally {
      if (isFresh(token)) setIsTransitioning(false)
    }
  }

  const handleDelete = async () => {
    if (!ticket) return
    const token = captureFreshness(ticket.public_id)
    if (!token) return
    setIsDeleting(true)
    try {
      const result = await deleteTicketAdmin(ticket.public_id, ticket.version)
      if (!isFresh(token)) return
      if (result.success) {
        setDeleteConfirmOpen(false)
        toast.success(t('Ticket moved to trash'))
        triggerRefresh({ stats: true })
        onOpenChange(false)
      } else if (await refreshAfterVersionConflict(result, token, true)) {
        setDeleteConfirmOpen(false)
      } else {
        toast.error(result.message || t('Failed to delete ticket'))
      }
    } finally {
      if (isFresh(token)) setIsDeleting(false)
    }
  }

  const handleAddTag = async () => {
    if (!ticket || !tagDraft.trim()) return
    const token = captureFreshness(ticket.public_id)
    if (!token) return
    const result = await addTicketTagsAdmin(ticket.public_id, [
      tagDraft.trim().toLowerCase(),
    ])
    if (!isFresh(token)) return
    if (result.success && result.data) {
      setTicket(result.data)
      setTagDraft('')
      triggerRefresh()
    } else toast.error(result.message || t('Failed to add tag'))
  }

  const handleRemoveTag = async (tag: string) => {
    if (!ticket) return
    const token = captureFreshness(ticket.public_id)
    if (!token) return
    const result = await removeTicketTagAdmin(ticket.public_id, tag)
    if (!isFresh(token)) return
    if (result.success && result.data) {
      setTicket(result.data)
      triggerRefresh()
    } else toast.error(result.message || t('Failed to remove tag'))
  }

  const displayTicket = ticket ?? ticketSummary
  let statusLabel = t('Waiting on user')
  let statusVariant: 'success' | 'warning' | 'info' = 'info'
  if (displayTicket?.status === 'resolved') {
    statusLabel = t('Resolved')
    statusVariant = 'success'
  } else if (displayTicket?.waiting_on === 'staff') {
    statusLabel = t('Waiting on support')
    statusVariant = 'warning'
  }
  const canSend =
    Boolean(ticket) &&
    canSubmitTicketMessage(
      replyBody,
      attachmentUrls.length,
      isUploading,
      isReplying
    )
  let manageAction: ReactNode = null
  if (canManage && ticket?.status === 'open') {
    manageAction = (
      <Button
        type='button'
        variant='outline'
        size='sm'
        onClick={handleResolve}
        disabled={isTransitioning}
      >
        {t('Mark as resolved')}
      </Button>
    )
  } else if (canManage && ticket?.status === 'resolved') {
    manageAction = (
      <Button
        type='button'
        variant='outline'
        size='sm'
        onClick={handleReopen}
        disabled={isTransitioning}
      >
        {t('Reopen ticket')}
      </Button>
    )
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen && (isUploading || isReplying || isDeleting)) {
          return
        }
        if (!nextOpen) invalidateFreshness()
        onOpenChange(nextOpen)
      }}
    >
      <DialogContent className='flex h-[min(85vh,900px)] max-h-[calc(100vh-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl md:max-w-4xl lg:max-w-5xl'>
        <DialogHeader className='border-b px-5 py-4 pr-12 sm:px-6'>
          <DialogTitle className='truncate'>
            {displayTicket?.subject}
          </DialogTitle>
          <DialogDescription className='flex flex-wrap items-center gap-2'>
            {displayTicket && (
              <>
                <StatusBadge
                  label={statusLabel}
                  variant={statusVariant}
                  copyable={false}
                />
                <span className='text-xs'>
                  {t(TICKET_CATEGORY_LABELS[displayTicket.category])}
                </span>
                <span className='text-xs'>
                  {t('User {{id}}', { id: displayTicket.user_id })}
                </span>
                <span className='text-xs'>#{displayTicket.public_id}</span>
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        {ticket?.user_profile && (
          <TicketUserProfileCard profile={ticket.user_profile} />
        )}

        {canManage && (
          <div className='border-border/70 flex flex-wrap items-center gap-2 border-b px-4 py-2.5 sm:px-6'>
            <span className='text-muted-foreground text-xs whitespace-nowrap'>
              {t('Assigned to')}
            </span>
            <StaffAssigneePicker
              value={assigneeUserId}
              onChange={setAssigneeUserId}
              disabled={!ticket || isTransitioning}
            />
            <Button
              type='button'
              size='sm'
              variant='outline'
              onClick={handleAssign}
              disabled={!ticket || isTransitioning}
            >
              {t('Save')}
            </Button>
            <span className='bg-border mx-1 h-6 w-px' />
            {(ticket?.tags ?? []).map((tag) => (
              <Badge key={tag} variant='secondary' className='gap-1'>
                {tag}
                <button
                  type='button'
                  aria-label={`${t('Remove')} ${tag}`}
                  onClick={() => void handleRemoveTag(tag)}
                >
                  <X className='size-3' />
                </button>
              </Badge>
            ))}
            <Input
              value={tagDraft}
              onChange={(event) => setTagDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  void handleAddTag()
                }
              }}
              placeholder={t('Add tag')}
              className='h-8 w-32'
              disabled={!ticket}
            />
            <Button
              type='button'
              size='icon-sm'
              variant='outline'
              onClick={() => void handleAddTag()}
              disabled={!ticket || !tagDraft.trim()}
              aria-label={t('Add tag')}
            >
              <Plus />
            </Button>
          </div>
        )}

        <div className='bg-muted/20 flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-5 sm:px-8'>
          {hasMoreOlder && (
            <div className='mb-3 flex justify-center'>
              <Button
                type='button'
                variant='ghost'
                size='sm'
                onClick={loadOlderMessages}
                disabled={isLoadingOlder}
              >
                {isLoadingOlder ? t('Loading...') : t('Load older messages')}
              </Button>
            </div>
          )}

          {isLoading && messages.length === 0 && (
            <p className='text-muted-foreground py-8 text-center text-sm'>
              {t('Loading...')}
            </p>
          )}

          {loadError && (
            <Alert variant='destructive'>
              <AlertTitle>{t('Failed to load ticket details')}</AlertTitle>
              <AlertDescription className='flex flex-col items-start gap-3'>
                <Button
                  type='button'
                  size='sm'
                  variant='outline'
                  onClick={() => setReloadToken((token) => token + 1)}
                >
                  {t('Retry')}
                </Button>
              </AlertDescription>
            </Alert>
          )}

          <div className='mx-auto flex w-full max-w-4xl flex-col gap-3'>
            {messages.map((message, index) => {
              const isStaff = message.author_kind === 'staff'
              const isInternal = message.visibility === 'internal'
              const messageDate = formatTimestampToDate(
                message.created_at
              ).slice(0, 10)
              const previousDate =
                index > 0
                  ? formatTimestampToDate(messages[index - 1].created_at).slice(
                      0,
                      10
                    )
                  : null
              let messageClassName =
                'bg-background text-foreground rounded-bl-md border'
              if (isStaff) {
                messageClassName =
                  'bg-primary text-primary-foreground rounded-br-md'
              }
              if (isInternal) {
                messageClassName =
                  'border border-amber-500/40 bg-amber-500/15 text-foreground'
              }
              let authorLabel = t('User')
              if (message.author_kind === 'staff') {
                authorLabel = t('Staff {{id}}', {
                  id: message.author_user_id,
                })
              }
              if (message.author_kind === 'system') authorLabel = t('System')
              return (
                <Fragment key={message.id}>
                  {messageDate !== previousDate && (
                    <div className='text-muted-foreground flex items-center gap-3 py-2 text-xs'>
                      <span className='bg-border h-px flex-1' />
                      <span>{messageDate}</span>
                      <span className='bg-border h-px flex-1' />
                    </div>
                  )}
                  <div
                    className={cn(
                      'flex flex-col gap-1',
                      isStaff ? 'items-end' : 'items-start'
                    )}
                  >
                    <div
                      className={cn(
                        'max-w-[88%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap shadow-xs',
                        messageClassName
                      )}
                    >
                      {message.body}
                      {!!message.attachment_urls?.length && (
                        <TicketAttachments
                          urls={message.attachment_urls}
                          mode='admin'
                        />
                      )}
                    </div>
                    <span className='text-muted-foreground px-1 text-[11px]'>
                      {isInternal && `${t('Internal note')} · `}
                      {authorLabel}
                      {' · '}
                      {formatTimestampToDate(message.created_at)}
                    </span>
                  </div>
                </Fragment>
              )
            })}
          </div>
        </div>

        {(canReply || canManage) && (
          <div className='border-border/70 bg-background/95 flex flex-col gap-2 border-t px-4 py-3 sm:px-6 sm:py-4'>
            {canReply && (
              <Textarea
                value={replyBody}
                onChange={(event) => setReplyBody(event.target.value)}
                rows={3}
                maxLength={5000}
                placeholder={replyPlaceholder}
                readOnly={!canReply}
                disabled={!ticket || isReplying}
                onPaste={(event) => {
                  if (!canReply) return
                  const files = [...event.clipboardData.files].filter((file) =>
                    file.type.startsWith('image/')
                  )
                  if (files.length === 0) return
                  event.preventDefault()
                  void attachmentFieldRef.current?.uploadFiles(files)
                }}
                onKeyDown={(event) => {
                  if (
                    canReply &&
                    (event.metaKey || event.ctrlKey) &&
                    event.key === 'Enter'
                  ) {
                    event.preventDefault()
                    if (canSend) void handleReply()
                  }
                }}
              />
            )}
            {canReply && (
              <TicketAttachmentField
                ref={attachmentFieldRef}
                urls={attachmentUrls}
                onChange={setAttachmentUrls}
                upload={uploadTicketAttachmentAdmin}
                buildDownloadHref={buildTicketAttachmentDownloadUrlAdmin}
                disabled={!ticket || isReplying}
                onUploadingChange={setIsUploading}
              />
            )}
            <div className='flex items-center justify-between gap-2'>
              <div className='flex items-center gap-3'>
                {canReply && (
                  <label className='flex items-center gap-2 text-xs'>
                    <Switch checked={internal} onCheckedChange={setInternal} />
                    {t('Internal note (not visible to user)')}
                  </label>
                )}
                {manageAction}
                {canDelete && (
                  <Button
                    type='button'
                    size='sm'
                    variant='destructive'
                    onClick={() => setDeleteConfirmOpen(true)}
                    disabled={!ticket || isDeleting}
                  >
                    <Trash2 data-icon='inline-start' />
                    {t('Delete ticket')}
                  </Button>
                )}
              </div>
              <div className='flex items-center gap-2'>
                {canReply && (
                  <Button
                    type='button'
                    size='sm'
                    onClick={handleReply}
                    disabled={!canSend}
                  >
                    <Send data-icon='inline-start' />
                    {isReplying ? t('Sending...') : t('Send')}
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}
      </DialogContent>
      <TicketDeleteConfirmation
        open={deleteConfirmOpen}
        onOpenChange={setDeleteConfirmOpen}
        subject={ticket?.subject ?? ''}
        publicId={ticket?.public_id ?? ''}
        isLoading={isDeleting}
        onConfirm={() => void handleDelete()}
      />
    </Dialog>
  )
}
