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
import { useEffect, useState } from 'react'

import {
  fetchTicketAttachment,
  type TicketAttachmentMode,
} from '../lib/ticket-attachments'

type AttachmentObjectUrlState = {
  objectUrl: string | null
  loading: boolean
  failed: boolean
}

export function useTicketAttachmentUrl(
  url: string | null,
  mode: TicketAttachmentMode
): AttachmentObjectUrlState {
  const [state, setState] = useState<AttachmentObjectUrlState>({
    objectUrl: null,
    loading: false,
    failed: false,
  })

  useEffect(() => {
    if (!url) {
      setState({ objectUrl: null, loading: false, failed: false })
      return
    }

    const controller = new AbortController()
    let objectUrl: string | null = null
    setState({ objectUrl: null, loading: true, failed: false })
    void fetchTicketAttachment(url, mode, controller.signal)
      .then((blob) => {
        if (controller.signal.aborted) return
        objectUrl = URL.createObjectURL(blob)
        setState({ objectUrl, loading: false, failed: false })
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setState({ objectUrl: null, loading: false, failed: true })
        }
      })

    return () => {
      controller.abort()
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [mode, url])

  return state
}
