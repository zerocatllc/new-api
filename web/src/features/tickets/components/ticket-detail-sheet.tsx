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
import { Send } from 'lucide-react'
import { Fragment, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { StatusBadge } from '@/components/status-badge'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { formatTimestampToDate } from '@/lib/format'
import { cn } from '@/lib/utils'

import {
  buildMyTicketAttachmentDownloadUrl,
  getMyTicket,
  listMyTicketMessages,
  markMyTicketRead,
  replyMyTicket,
  resolveMyTicket,
  uploadMyTicketAttachment,
} from '../api'
import { TICKET_CATEGORY_LABELS, TICKET_MESSAGE_PAGE_SIZE } from '../constants'
import { canSubmitTicketMessage } from '../lib/ticket-composer'
import { ticketQueryKeys } from '../lib/ticket-query-keys'
import { reloadTicketDetailAfterVersionConflict } from '../lib/ticket-version-conflict'
import { useTicketDetailFreshness } from '../lib/use-ticket-detail-freshness'
import type { Ticket, TicketMessage } from '../types'
import {
  TicketAttachmentField,
  type TicketAttachmentFieldHandle,
} from './ticket-attachment-field'
import { TicketAttachments } from './ticket-attachments'
import { useTickets } from './tickets-provider'

type TicketDetailSheetProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  ticketSummary: Ticket | null
}

export function TicketDetailSheet({
  open,
  onOpenChange,
  ticketSummary,
}: TicketDetailSheetProps) {
  const { t } = useTranslation()
  const { triggerRefresh, attachmentsEnabled } = useTickets()
  const queryClient = useQueryClient()

  const [ticket, setTicket] = useState<Ticket | null>(null)
  const [messages, setMessages] = useState<TicketMessage[]>([])
  const [hasMoreOlder, setHasMoreOlder] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [isLoadingOlder, setIsLoadingOlder] = useState(false)
  const [replyBody, setReplyBody] = useState('')
  const [attachmentUrls, setAttachmentUrls] = useState<string[]>([])
  const [isReplying, setIsReplying] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [isTransitioning, setIsTransitioning] = useState(false)
  const [loadError, setLoadError] = useState(false)
  const [reloadToken, setReloadToken] = useState(0)
  const attachmentFieldRef = useRef<TicketAttachmentFieldHandle>(null)
  const {
    activate: activateFreshness,
    capture: captureFreshness,
    invalidate: invalidateFreshness,
    isCurrent: isFresh,
  } = useTicketDetailFreshness()

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
    setIsLoadingOlder(false)
    setIsReplying(false)
    setIsTransitioning(false)
    setLoadError(false)
    setIsLoading(true)

    async function load() {
      let loadedTicket: Ticket | null = null
      let loadedMessages: TicketMessage[] | null = null
      try {
        const [ticketResult, messagesResult] = await Promise.all([
          getMyTicket(publicId),
          listMyTicketMessages(publicId, undefined, TICKET_MESSAGE_PAGE_SIZE),
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
      // Backend returns newest-first; the thread reads oldest-first.
      const ascending = [...loadedMessages].reverse()
      setMessages(ascending)
      setHasMoreOlder(loadedMessages.length === TICKET_MESSAGE_PAGE_SIZE)
      setIsLoading(false)
      try {
        await markMyTicketRead(publicId)
      } catch {
        return
      }
      if (!isFresh(token)) return
      triggerRefresh()
      await queryClient.invalidateQueries({
        queryKey: ticketQueryKeys.userUnread,
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
      const result = await listMyTicketMessages(
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
      const result = await replyMyTicket(ticket.public_id, {
        body: replyBody.trim(),
        internal: false,
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
        triggerRefresh()
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
      const result = await resolveMyTicket(ticket.public_id, {
        expected_version: ticket.version,
      })
      if (!isFresh(token)) return
      if (result.success && result.data) {
        setTicket(result.data)
        toast.success(t('Ticket resolved'))
        triggerRefresh()
      } else {
        let refreshed
        try {
          refreshed = await reloadTicketDetailAfterVersionConflict(
            result,
            () => getMyTicket(token.publicId),
            () =>
              listMyTicketMessages(
                token.publicId,
                undefined,
                TICKET_MESSAGE_PAGE_SIZE
              )
          )
        } catch {
          if (isFresh(token)) {
            toast.error(t('Failed to load ticket details'))
          }
          return
        }
        if (!isFresh(token)) return
        if (refreshed) {
          setTicket(refreshed.ticket)
          setMessages(refreshed.messages)
          setHasMoreOlder(
            refreshed.messages.length === TICKET_MESSAGE_PAGE_SIZE
          )
          triggerRefresh()
          toast.error(
            t(
              'Ticket changed. Latest details were loaded; review them and try again.'
            )
          )
        } else {
          toast.error(
            result.message || t('Failed to resolve ticket, please reload')
          )
        }
      }
    } finally {
      if (isFresh(token)) setIsTransitioning(false)
    }
  }

  const displayTicket = ticket ?? ticketSummary
  let statusLabel = t('Replied')
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

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen && (isUploading || isReplying)) return
        if (!nextOpen) invalidateFreshness()
        onOpenChange(nextOpen)
      }}
    >
      <DialogContent className='flex h-[min(85vh,860px)] max-h-[calc(100vh-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl md:max-w-4xl lg:max-w-5xl'>
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
                <span className='text-xs'>#{displayTicket.public_id}</span>
              </>
            )}
          </DialogDescription>
        </DialogHeader>

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
              const isMine = message.author_kind === 'user'
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
              let authorLabel = t('You')
              if (message.author_kind === 'staff') authorLabel = t('Support')
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
                      isMine ? 'items-end' : 'items-start'
                    )}
                  >
                    <div
                      className={cn(
                        'max-w-[88%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap shadow-xs',
                        isMine
                          ? 'bg-primary text-primary-foreground rounded-br-md'
                          : 'bg-background text-foreground rounded-bl-md border'
                      )}
                    >
                      {message.body}
                      {!!message.attachment_urls?.length && (
                        <TicketAttachments
                          urls={message.attachment_urls}
                          mode='user'
                        />
                      )}
                    </div>
                    <span className='text-muted-foreground px-1 text-[11px]'>
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

        <div className='border-border/70 bg-background flex flex-col gap-2 border-t px-4 py-3 sm:px-6 sm:py-4'>
          <Textarea
            value={replyBody}
            onChange={(event) => setReplyBody(event.target.value)}
            rows={3}
            maxLength={5000}
            placeholder={t('Write a reply...')}
            disabled={!ticket || isReplying}
            onPaste={(event) => {
              const files = [...event.clipboardData.files].filter((file) =>
                file.type.startsWith('image/')
              )
              if (files.length === 0) return
              event.preventDefault()
              void attachmentFieldRef.current?.uploadFiles(files)
            }}
            onKeyDown={(event) => {
              if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
                event.preventDefault()
                if (canSend) void handleReply()
              }
            }}
          />
          {attachmentsEnabled && (
            <TicketAttachmentField
              ref={attachmentFieldRef}
              urls={attachmentUrls}
              onChange={setAttachmentUrls}
              upload={uploadMyTicketAttachment}
              buildDownloadHref={buildMyTicketAttachmentDownloadUrl}
              disabled={!ticket || isReplying}
              onUploadingChange={setIsUploading}
            />
          )}
          <div className='flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between'>
            <div>
              {ticket?.status === 'open' && (
                <Button
                  type='button'
                  variant='outline'
                  size='sm'
                  onClick={handleResolve}
                  disabled={isTransitioning}
                >
                  {t('Mark as resolved')}
                </Button>
              )}
              {ticket && ticket.status !== 'open' && (
                <span className='text-muted-foreground text-xs'>
                  {t('Sending a reply will reopen this ticket.')}
                </span>
              )}
            </div>
            <Button
              type='button'
              size='sm'
              onClick={handleReply}
              disabled={!canSend}
            >
              <Send data-icon='inline-start' />
              {isReplying ? t('Sending...') : t('Send Reply')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
