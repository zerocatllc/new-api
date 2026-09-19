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
  Download,
  FileArchive,
  FileJson,
  FileSpreadsheet,
  FileText,
  ImageOff,
  Loader2,
  Presentation,
  ZoomIn,
} from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { useTicketAttachmentUrl } from '../hooks/use-ticket-attachment-url'
import {
  attachmentFileName,
  isTicketImage,
  type TicketAttachmentMode,
  triggerTicketDownload,
} from '../lib/ticket-attachments'
import { TicketImageViewer } from './ticket-image-viewer'

type TicketAttachmentsProps = {
  urls: string[]
  mode: TicketAttachmentMode
}

function AttachmentIcon({ name }: { name: string }) {
  const className = 'text-muted-foreground size-4 shrink-0'
  if (/\.(?:xlsx|csv)$/i.test(name)) {
    return <FileSpreadsheet className={className} />
  }
  if (/\.pptx$/i.test(name)) return <Presentation className={className} />
  if (/\.zip$/i.test(name)) return <FileArchive className={className} />
  if (/\.json$/i.test(name)) return <FileJson className={className} />
  return <FileText className={className} />
}

export function TicketAttachments({ urls, mode }: TicketAttachmentsProps) {
  const { t } = useTranslation()
  const [selectedImage, setSelectedImage] = useState<string | null>(null)
  if (urls.length === 0) return null

  return (
    <>
      <div className='mt-2 flex flex-wrap gap-2'>
        {urls.map((url) => {
          const name = attachmentFileName(url)
          if (isTicketImage(url)) {
            return (
              <TicketImageThumbnail
                key={url}
                url={url}
                name={name}
                mode={mode}
                onOpen={() => setSelectedImage(url)}
              />
            )
          }
          return (
            <button
              key={url}
              type='button'
              onClick={() => {
                void triggerTicketDownload(url, mode).catch(() => {
                  toast.error(t('Failed to download attachment'))
                })
              }}
              className='bg-background text-foreground hover:bg-muted flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs shadow-xs transition-colors'
            >
              <AttachmentIcon name={name} />
              <span className='max-w-[180px] truncate'>{name}</span>
              <Download className='text-muted-foreground/60 size-3 shrink-0' />
            </button>
          )
        })}
      </div>
      <TicketImageViewer
        url={selectedImage}
        mode={mode}
        onClose={() => setSelectedImage(null)}
      />
    </>
  )
}

function TicketImageThumbnail(props: {
  url: string
  name: string
  mode: TicketAttachmentMode
  onOpen: () => void
}) {
  const source = useTicketAttachmentUrl(props.url, props.mode)
  return (
    <button
      type='button'
      onClick={props.onOpen}
      disabled={!source.objectUrl}
      className='group focus-visible:ring-ring relative flex min-h-24 min-w-32 items-center justify-center overflow-hidden rounded-lg border shadow-xs focus-visible:ring-2 focus-visible:outline-none disabled:cursor-not-allowed'
    >
      {source.loading && <Loader2 className='size-5 animate-spin' />}
      {source.failed && <ImageOff className='text-muted-foreground size-5' />}
      {source.objectUrl && (
        <img
          src={source.objectUrl}
          alt={props.name}
          className='max-h-48 max-w-xs object-contain transition-opacity group-hover:opacity-85'
        />
      )}
      {source.objectUrl && (
        <span className='absolute inset-0 flex items-center justify-center opacity-0 transition-opacity group-hover:opacity-100'>
          <span className='rounded-full bg-black/40 p-1.5 backdrop-blur-sm'>
            <ZoomIn className='size-4 text-white' />
          </span>
        </span>
      )}
    </button>
  )
}
