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
import { useCallback, useRef } from 'react'

export type TicketDetailFreshnessToken = {
  generation: number
  publicId: string
}

export function useTicketDetailFreshness() {
  const currentRef = useRef<{
    generation: number
    publicId: string | null
  }>({ generation: 0, publicId: null })

  const activate = useCallback(
    (publicId: string): TicketDetailFreshnessToken => {
      const token = {
        generation: currentRef.current.generation + 1,
        publicId,
      }
      currentRef.current = token
      return token
    },
    []
  )

  const invalidate = useCallback(() => {
    currentRef.current = {
      generation: currentRef.current.generation + 1,
      publicId: null,
    }
  }, [])

  const capture = useCallback(
    (publicId: string): TicketDetailFreshnessToken | null => {
      if (currentRef.current.publicId !== publicId) return null
      return {
        generation: currentRef.current.generation,
        publicId,
      }
    },
    []
  )

  const isCurrent = useCallback((token: TicketDetailFreshnessToken) => {
    return (
      currentRef.current.generation === token.generation &&
      currentRef.current.publicId === token.publicId
    )
  }, [])

  return { activate, capture, invalidate, isCurrent }
}
