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
import type { Table } from '@tanstack/react-table'
import { CheckCheck, Tags, UserRoundCheck } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { DataTableBulkActions } from '@/components/data-table'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { useAuthStore } from '@/stores/auth-store'

import {
  bulkAssignTicketsAdmin,
  bulkResolveTicketsAdmin,
  bulkTagTicketsAdmin,
} from '../api'
import { getTicketPermissions } from '../ticket-permissions'
import type { AdminTicket } from '../types'
import { StaffAssigneePicker } from './staff-assignee-picker'
import { useTicketManagement } from './ticket-management-provider'

type Action = 'assign' | 'tags' | null

export function TicketBulkActions({ table }: { table: Table<AdminTicket> }) {
  const { t } = useTranslation()
  const currentUser = useAuthStore((state) => state.auth.user)
  const { canManage } = getTicketPermissions(currentUser)
  const { triggerRefresh } = useTicketManagement()
  const [action, setAction] = useState<Action>(null)
  const [assignee, setAssignee] = useState<number | null>(null)
  const [tags, setTags] = useState('')
  const [busy, setBusy] = useState(false)
  const selected = table
    .getFilteredSelectedRowModel()
    .rows.map((row) => row.original)
  const items = selected.map((ticket) => ({
    public_id: ticket.public_id,
    expected_version: ticket.version,
  }))

  if (!canManage) return null

  const finish = (
    results: { success: boolean }[],
    options?: { stats?: boolean }
  ) => {
    const failed = results.filter((result) => !result.success).length
    if (failed) {
      toast.error(
        t('{{count}} ticket actions failed; the list was refreshed.', {
          count: failed,
        })
      )
    } else {
      toast.success(t('Selected tickets updated'))
    }
    table.resetRowSelection()
    setAction(null)
    triggerRefresh(options)
  }

  const resolve = async () => {
    setBusy(true)
    try {
      const result = await bulkResolveTicketsAdmin(items)
      if (!result.success || !result.data) {
        toast.error(result.message || t('Bulk action failed'))
      } else {
        finish(result.data.results, { stats: true })
      }
    } finally {
      setBusy(false)
    }
  }

  const apply = async () => {
    setBusy(true)
    try {
      const result =
        action === 'assign'
          ? await bulkAssignTicketsAdmin(items, assignee)
          : await bulkTagTicketsAdmin(
              selected.map((ticket) => ticket.public_id),
              tags
                .split(',')
                .map((tag) => tag.trim().toLowerCase())
                .filter(Boolean)
            )
      if (!result.success || !result.data) {
        toast.error(result.message || t('Bulk action failed'))
      } else {
        finish(result.data.results, { stats: action === 'assign' })
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <DataTableBulkActions table={table} entityName='ticket'>
        <Button
          size='sm'
          variant='outline'
          onClick={() => void resolve()}
          disabled={busy}
        >
          <CheckCheck />
          {t('Resolve')}
        </Button>
        <Button
          size='sm'
          variant='outline'
          onClick={() => setAction('assign')}
          disabled={busy}
        >
          <UserRoundCheck />
          {t('Assign')}
        </Button>
        <Button
          size='sm'
          variant='outline'
          onClick={() => setAction('tags')}
          disabled={busy}
        >
          <Tags />
          {t('Add tags')}
        </Button>
      </DataTableBulkActions>
      <Dialog
        open={action !== null}
        onOpenChange={(open) => !open && setAction(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {action === 'assign'
                ? t('Assign selected tickets')
                : t('Add tags to selected tickets')}
            </DialogTitle>
            <DialogDescription>
              {t('{{count}} tickets selected', { count: selected.length })}
            </DialogDescription>
          </DialogHeader>
          {action === 'assign' ? (
            <div className='space-y-2'>
              <StaffAssigneePicker
                value={assignee}
                onChange={setAssignee}
                disabled={busy}
              />
              {assignee === null && (
                <p className='text-muted-foreground text-xs'>
                  {t(
                    'No assignee selected; confirming will unassign the selected tickets.'
                  )}
                </p>
              )}
            </div>
          ) : (
            <Input
              value={tags}
              onChange={(event) => setTags(event.target.value)}
              placeholder={t('Comma-separated tags')}
              disabled={busy}
            />
          )}
          <DialogFooter>
            <Button
              variant='outline'
              onClick={() => setAction(null)}
              disabled={busy}
            >
              {t('Cancel')}
            </Button>
            <Button
              onClick={() => void apply()}
              disabled={busy || (action === 'tags' && !tags.trim())}
            >
              {action === 'assign' && assignee === null
                ? t('Unassign')
                : t('Confirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
