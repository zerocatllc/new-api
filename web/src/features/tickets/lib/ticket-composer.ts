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
export function canSubmitTicketMessage(
  body: string,
  attachmentCount: number,
  isUploading: boolean,
  isPending: boolean
): boolean {
  if (isUploading || isPending) return false
  return body.trim().length > 0 || attachmentCount > 0
}

export function filesWithinAttachmentLimit<T>(
  files: readonly T[],
  currentCount: number,
  maximumCount: number
): T[] {
  const remaining = Math.max(0, maximumCount - currentCount)
  return files.slice(0, remaining)
}
