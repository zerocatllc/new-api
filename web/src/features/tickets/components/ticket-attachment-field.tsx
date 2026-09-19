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
import { AlertCircle, FileText, Loader2, Paperclip, X } from 'lucide-react'
import { forwardRef, useImperativeHandle, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

import {
  TICKET_ATTACHMENT_MAX_COUNT,
  TICKET_ATTACHMENT_MAX_SIZE_BYTES,
} from '../constants'
import {
  attachmentFileName,
  triggerTicketDownloadHref,
} from '../lib/ticket-attachments'
import { filesWithinAttachmentLimit } from '../lib/ticket-composer'
import type { ApiResponse, TicketAttachmentUploadResponse } from '../types'

const TICKET_ATTACHMENT_ACCEPT =
  'image/jpeg,image/png,image/gif,image/webp,application/pdf,.docx,.xlsx,.pptx,.txt,.csv,.json,.log,.md,.zip'

type TicketAttachmentFieldProps = {
  urls: string[]
  onChange: (urls: string[]) => void
  upload: (file: File) => Promise<ApiResponse<TicketAttachmentUploadResponse>>
  buildDownloadHref: (url: string) => string
  disabled?: boolean
  onUploadingChange?: (isUploading: boolean) => void
}

export type TicketAttachmentFieldHandle = {
  uploadFiles: (files: readonly File[]) => Promise<void>
}

type PendingUpload = {
  id: string
  name: string
  status: 'uploading' | 'failed'
  error?: string
}

// Shared by the user create/reply forms and the staff reply form: an upload
// is independent of any specific ticket, so the same "attach now, submit the
// collected URLs with the message" flow works identically for both callers.
export const TicketAttachmentField = forwardRef<
  TicketAttachmentFieldHandle,
  TicketAttachmentFieldProps
>(function TicketAttachmentField(props, ref) {
  const { t } = useTranslation()
  const inputRef = useRef<HTMLInputElement>(null)
  const uploadInProgressRef = useRef(false)
  const [pendingUploads, setPendingUploads] = useState<PendingUpload[]>([])

  const isUploading = pendingUploads.some((item) => item.status === 'uploading')
  const atLimit = props.urls.length >= TICKET_ATTACHMENT_MAX_COUNT

  const handleRemove = (url: string) => {
    props.onChange(props.urls.filter((existing) => existing !== url))
  }

  const uploadFiles = async (candidateFiles: readonly File[]) => {
    if (uploadInProgressRef.current) {
      toast.error(t('Please wait for current uploads to finish'))
      return
    }

    const files = filesWithinAttachmentLimit(
      candidateFiles,
      props.urls.length,
      TICKET_ATTACHMENT_MAX_COUNT
    )
    if (files.length === 0) return
    if (files.length < candidateFiles.length) {
      toast.error(
        t('Maximum {{count}} attachments', {
          count: TICKET_ATTACHMENT_MAX_COUNT,
        })
      )
    }

    const validFiles = files.filter((file) => {
      if (file.size === 0) {
        toast.error(t('File is empty'))
        return false
      }
      if (file.size > TICKET_ATTACHMENT_MAX_SIZE_BYTES) {
        toast.error(
          t('File is too large (max {{size}}MB)', {
            size: TICKET_ATTACHMENT_MAX_SIZE_BYTES / (1024 * 1024),
          })
        )
        return false
      }
      return true
    })
    if (validFiles.length === 0) return

    const uploads = validFiles.map((file) => ({
      id: crypto.randomUUID(),
      name: file.name,
      status: 'uploading' as const,
    }))
    uploadInProgressRef.current = true
    setPendingUploads((current) => [...current, ...uploads])
    props.onUploadingChange?.(true)

    const completedUrls: string[] = []
    let failedCount = 0
    try {
      await Promise.all(
        validFiles.map(async (file, index) => {
          const item = uploads[index]
          try {
            const result = await props.upload(file)
            if (result.success && result.data) {
              completedUrls.push(result.data.url)
              setPendingUploads((current) =>
                current.filter((existing) => existing.id !== item.id)
              )
            } else {
              failedCount += 1
              const error = result.message || t('Failed to upload attachment')
              setPendingUploads((current) =>
                current.map((existing) =>
                  existing.id === item.id
                    ? { ...existing, status: 'failed', error }
                    : existing
                )
              )
            }
          } catch (error) {
            failedCount += 1
            const message =
              error instanceof Error
                ? error.message
                : t('Failed to upload attachment')
            setPendingUploads((current) =>
              current.map((existing) =>
                existing.id === item.id
                  ? { ...existing, status: 'failed', error: message }
                  : existing
              )
            )
          }
        })
      )
      if (completedUrls.length > 0) {
        props.onChange([...props.urls, ...completedUrls])
      }
    } finally {
      uploadInProgressRef.current = false
      // The batch is over: uploading is false regardless of failures. The
      // old `failedCount > 0` here reported "still uploading" forever after
      // any failure, which locked the surrounding dialog's Submit AND
      // Cancel/close (both gate on isUploading) with a misleading
      // "Uploading..." label -- the only escape was spotting the small
      // dismiss button on the failed row. Failed rows stay listed for the
      // user to read and dismiss, but they must not hold the form hostage.
      props.onUploadingChange?.(false)
    }
  }

  useImperativeHandle(ref, () => ({ uploadFiles }))

  return (
    <div className='flex flex-col gap-2'>
      {(props.urls.length > 0 || pendingUploads.length > 0) && (
        <ul className='grid gap-2 sm:grid-cols-2'>
          {props.urls.map((url) => (
            <li
              key={url}
              className='bg-muted/60 flex min-w-0 items-center gap-2 rounded-lg border px-3 py-2 text-xs'
            >
              <FileText className='text-muted-foreground size-4 shrink-0' />
              <button
                type='button'
                onClick={() => {
                  void triggerTicketDownloadHref(
                    props.buildDownloadHref(url),
                    attachmentFileName(url)
                  ).catch(() => {
                    toast.error(t('Failed to download attachment'))
                  })
                }}
                className='min-w-0 flex-1 truncate underline-offset-2 hover:underline'
              >
                {attachmentFileName(url)}
              </button>
              <button
                type='button'
                onClick={() => handleRemove(url)}
                disabled={props.disabled || isUploading}
                className='text-muted-foreground hover:text-foreground disabled:opacity-50'
                aria-label={t('Remove attachment')}
              >
                <X className='h-3 w-3' />
              </button>
            </li>
          ))}
          {pendingUploads.map((item) => (
            <li
              key={item.id}
              className='bg-muted/60 flex min-w-0 items-center gap-2 rounded-lg border px-3 py-2 text-xs'
            >
              {item.status === 'uploading' ? (
                <Loader2 className='text-muted-foreground size-4 shrink-0 animate-spin' />
              ) : (
                <AlertCircle className='text-destructive size-4 shrink-0' />
              )}
              <div className='min-w-0 flex-1'>
                <p className='truncate'>{item.name}</p>
                <p
                  className={
                    item.status === 'failed'
                      ? 'text-destructive truncate'
                      : 'text-muted-foreground'
                  }
                >
                  {item.status === 'failed' ? item.error : t('Uploading...')}
                </p>
              </div>
              {item.status === 'failed' && (
                <button
                  type='button'
                  className='text-muted-foreground hover:text-foreground'
                  onClick={() => {
                    setPendingUploads((current) =>
                      current.filter((existing) => existing.id !== item.id)
                    )
                  }}
                  aria-label={t('Dismiss upload error')}
                >
                  <X className='size-3.5' />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      <div className='flex items-center gap-2'>
        <Input
          ref={inputRef}
          type='file'
          multiple
          accept={TICKET_ATTACHMENT_ACCEPT}
          className='hidden'
          disabled={props.disabled || isUploading || atLimit}
          onChange={async (event) => {
            const files = [...(event.target.files ?? [])]
            event.target.value = ''
            await uploadFiles(files)
          }}
        />
        <Button
          type='button'
          variant='outline'
          size='sm'
          disabled={props.disabled || isUploading || atLimit}
          onClick={() => inputRef.current?.click()}
        >
          {isUploading ? (
            <Loader2 className='mr-1.5 h-3.5 w-3.5 animate-spin' />
          ) : (
            <Paperclip className='mr-1.5 h-3.5 w-3.5' />
          )}
          {t('Attach files')}
        </Button>
        {atLimit && (
          <span className='text-muted-foreground text-xs'>
            {t('Maximum {{count}} attachments', {
              count: TICKET_ATTACHMENT_MAX_COUNT,
            })}
          </span>
        )}
      </div>
    </div>
  )
})
