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
import { hasPermission } from '@/lib/admin-permissions'
import type { AuthUser } from '@/stores/auth-store'

export type TicketPermissionState = {
  canRead: boolean
  canReply: boolean
  canManage: boolean
  canWriteSettings: boolean
  canDelete: boolean
}

export function getTicketPermissions(
  user: AuthUser | null | undefined
): TicketPermissionState {
  return {
    canRead: hasPermission(user, 'ticket', 'read'),
    canReply: hasPermission(user, 'ticket', 'reply'),
    canManage: hasPermission(user, 'ticket', 'manage'),
    canWriteSettings: hasPermission(user, 'ticket', 'settings_write'),
    canDelete: hasPermission(user, 'ticket', 'delete'),
  }
}
