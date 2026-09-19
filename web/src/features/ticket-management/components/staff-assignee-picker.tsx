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
import { useQuery } from '@tanstack/react-query'
import { useEffect, useId, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { searchUsers } from '@/features/users/api'

export function StaffAssigneePicker({
  value,
  disabled,
  onChange,
}: {
  value: number | null
  disabled?: boolean
  onChange: (value: number | null) => void
}) {
  const { t } = useTranslation()
  const listboxId = useId()
  const [search, setSearch] = useState(value == null ? '' : `#${value}`)
  const [debounced, setDebounced] = useState('')

  useEffect(() => {
    setSearch(value == null ? '' : `#${value}`)
  }, [value])

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(search.trim()), 250)
    return () => window.clearTimeout(timer)
  }, [search])

  const result = useQuery({
    queryKey: ['ticket-staff-search', debounced],
    enabled: debounced.length > 0 && !disabled,
    queryFn: () =>
      searchUsers({
        keyword: debounced.replace(/^#/, ''),
        p: 1,
        page_size: 20,
      }),
  })
  const staff = (result.data?.data?.items ?? []).filter(
    (user) => user.role >= 10 && user.status === 1
  )

  return (
    <div className='relative flex min-w-0 flex-1 items-center gap-2'>
      <Input
        value={search}
        onChange={(event) => {
          setSearch(event.target.value)
          onChange(null)
        }}
        className='h-8 max-w-64 min-w-36'
        placeholder={t('Search staff')}
        disabled={disabled}
        role='combobox'
        aria-expanded={Boolean(debounced && value === null)}
        aria-controls={listboxId}
        aria-autocomplete='list'
      />
      {value !== null && (
        <Button
          type='button'
          size='sm'
          variant='ghost'
          disabled={disabled}
          onClick={() => {
            onChange(null)
            setSearch('')
          }}
        >
          {t('Clear')}
        </Button>
      )}
      {debounced && value === null && (
        <div
          role='listbox'
          id={listboxId}
          className='bg-popover absolute top-full left-0 z-30 mt-1 max-h-52 w-80 overflow-y-auto rounded-md border p-1 shadow-md'
        >
          {staff.map((user) => (
            <button
              key={user.id}
              type='button'
              role='option'
              aria-selected={false}
              className='hover:bg-accent flex w-full items-center justify-between rounded-sm px-3 py-2 text-left text-sm'
              onClick={() => {
                onChange(user.id)
                setSearch(`${user.display_name || user.username} (#${user.id})`)
              }}
            >
              <span>{user.display_name || user.username}</span>
              <span className='text-muted-foreground'>#{user.id}</span>
            </button>
          ))}
          {!result.isFetching && staff.length === 0 && (
            <div className='text-muted-foreground px-3 py-2 text-sm'>
              {t('No staff found')}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
