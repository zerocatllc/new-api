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
import { ExternalLink, Loader2, Maximize2, Minus, Plus, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'

import { useTicketAttachmentUrl } from '../hooks/use-ticket-attachment-url'
import {
  attachmentFileName,
  type TicketAttachmentMode,
} from '../lib/ticket-attachments'

type TicketImageViewerProps = {
  url: string | null
  mode: TicketAttachmentMode
  onClose: () => void
}

export function TicketImageViewer({
  url,
  mode,
  onClose,
}: TicketImageViewerProps) {
  const { t } = useTranslation()
  const [scale, setScale] = useState(1)
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const dragRef = useRef<{
    x: number
    y: number
    px: number
    py: number
  } | null>(null)
  const stageRef = useRef<HTMLDivElement | null>(null)
  const source = useTicketAttachmentUrl(url, mode)

  useEffect(() => {
    setScale(1)
    setPosition({ x: 0, y: 0 })
  }, [url])

  useEffect(() => {
    const stage = stageRef.current
    if (!stage) return
    // React root wheel listeners are passive, so preventDefault() there cannot
    // stop the page from scrolling behind the viewer; attach non-passively.
    const onWheel = (event: WheelEvent) => {
      event.preventDefault()
      setScale((current) =>
        Math.min(6, Math.max(0.25, current + (event.deltaY < 0 ? 0.15 : -0.15)))
      )
    }
    stage.addEventListener('wheel', onWheel, { passive: false })
    return () => stage.removeEventListener('wheel', onWheel)
  }, [url])

  if (!url) return null
  const clampScale = (next: number) => Math.min(6, Math.max(0.25, next))
  const fit = () => {
    setScale(1)
    setPosition({ x: 0, y: 0 })
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        showCloseButton={false}
        className='h-[92vh] max-w-[96vw] overflow-hidden bg-black/95 p-0 text-white ring-0 sm:max-w-[96vw]'
      >
        <DialogTitle className='sr-only'>{attachmentFileName(url)}</DialogTitle>
        <header className='absolute inset-x-0 top-0 z-20 flex items-center justify-between gap-3 bg-black/55 px-4 py-3 backdrop-blur-sm'>
          <span className='truncate text-sm'>{attachmentFileName(url)}</span>
          <div className='flex shrink-0 items-center gap-1'>
            <Button
              variant='ghost'
              size='icon-sm'
              onClick={() => setScale(clampScale(scale - 0.25))}
              aria-label={t('Zoom out')}
            >
              <Minus />
            </Button>
            <span className='w-14 text-center text-xs'>
              {Math.round(scale * 100)}%
            </span>
            <Button
              variant='ghost'
              size='icon-sm'
              onClick={() => setScale(clampScale(scale + 0.25))}
              aria-label={t('Zoom in')}
            >
              <Plus />
            </Button>
            <Button
              variant='ghost'
              size='icon-sm'
              onClick={fit}
              aria-label={t('Fit to viewport')}
            >
              <Maximize2 />
            </Button>
            <Button
              variant='ghost'
              size='icon-sm'
              disabled={!source.objectUrl}
              onClick={() =>
                source.objectUrl &&
                window.open(source.objectUrl, '_blank', 'noopener,noreferrer')
              }
              aria-label={t('Open in new window')}
            >
              <ExternalLink />
            </Button>
            <Button
              variant='ghost'
              size='icon-sm'
              onClick={onClose}
              aria-label={t('Close')}
            >
              <X />
            </Button>
          </div>
        </header>
        <div
          ref={stageRef}
          className='flex h-full w-full cursor-grab items-center justify-center overflow-hidden active:cursor-grabbing'
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId)
            dragRef.current = {
              x: event.clientX,
              y: event.clientY,
              px: position.x,
              py: position.y,
            }
          }}
          onPointerMove={(event) => {
            const drag = dragRef.current
            if (!drag) return
            setPosition({
              x: drag.px + event.clientX - drag.x,
              y: drag.py + event.clientY - drag.y,
            })
          }}
          onPointerUp={() => {
            dragRef.current = null
          }}
          onDoubleClick={() => setScale((current) => (current === 1 ? 2 : 1))}
        >
          {source.loading && <Loader2 className='size-8 animate-spin' />}
          {source.failed && (
            <p className='text-sm text-red-300'>
              {t('Failed to load attachment')}
            </p>
          )}
          {source.objectUrl && (
            <img
              src={source.objectUrl}
              alt={attachmentFileName(url)}
              draggable={false}
              className='max-h-[82vh] max-w-[92vw] object-contain transition-transform duration-100 select-none'
              style={{
                transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
              }}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
