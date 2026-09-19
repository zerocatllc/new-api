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
import { Check, ChevronsUpDown, X } from 'lucide-react'
/**
 * SearchCombobox — a faithful port of the reference (:3011) combobox used by
 * the generic search form. Built on the fork's Popover + Command primitives.
 * Supports single/multiple selection (with removable badges + "+N" collapse),
 * per-option icons, an "official" badge, and group headers (isHeader).
 */
import * as React from 'react'
import { useTranslation } from 'react-i18next'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { cn } from '@/lib/utils'

export interface SearchComboboxOption {
  label: string
  value: string
  icon?: React.ReactNode
  official?: boolean
  disabled?: boolean
  isHeader?: boolean
}

interface SearchComboboxBaseProps {
  id?: string
  options: SearchComboboxOption[]
  placeholder?: string
  searchPlaceholder?: string
  emptyText?: string
  className?: string
  disabled?: boolean
  maxHeight?: string
  hideCheck?: boolean
  allowDeselect?: boolean
  onBadgeClick?: (value: string) => void
}

interface SingleProps extends SearchComboboxBaseProps {
  multiple?: false
  value?: string
  onValueChange?: (value: string) => void
}

interface MultipleProps extends SearchComboboxBaseProps {
  multiple: true
  value?: string[]
  onValueChange?: (value: string[]) => void
}

export type SearchComboboxProps = SingleProps | MultipleProps

const VISIBLE_BADGES = 5

export function SearchCombobox(props: SearchComboboxProps) {
  const { t } = useTranslation('common')
  const {
    id,
    options,
    placeholder = t('Select'),
    searchPlaceholder = t('Search'),
    emptyText = t('No data'),
    className,
    disabled = false,
    maxHeight = '300px',
    hideCheck = false,
    allowDeselect = true,
    multiple = false,
    onBadgeClick,
  } = props

  const [open, setOpen] = React.useState(false)
  const [search, setSearch] = React.useState('')
  const [expanded, setExpanded] = React.useState(true)

  const value = props.value
  const selectedOption = multiple
    ? undefined
    : options.find((o) => o.value === value)

  const selectedMulti = React.useMemo<SearchComboboxOption[]>(() => {
    if (!multiple || !Array.isArray(value)) return []
    const map = new Map(options.map((o) => [o.value, o]))
    return value.map((v) => map.get(v) ?? { value: v, label: v })
  }, [multiple, value, options])

  const visibleMulti =
    !multiple || !expanded
      ? selectedMulti
      : selectedMulti.slice(0, VISIBLE_BADGES)
  const hiddenCount =
    !multiple || !expanded
      ? 0
      : Math.max(0, selectedMulti.length - VISIBLE_BADGES)

  const filtered = React.useMemo(
    () =>
      !search
        ? options
        : options.filter((o) =>
            o.label.toLowerCase().includes(search.toLowerCase())
          ),
    [options, search]
  )

  const handleOpenChange = (next: boolean) => {
    setOpen(next)
    if (!next) setSearch('')
  }

  const selectSingle = (v: string) => {
    if (multiple) return
    const single = props as SingleProps
    single.onValueChange?.(allowDeselect && v === value ? '' : v)
    setOpen(false)
  }

  const toggleMulti = (v: string) => {
    if (!multiple) return
    const multi = props as MultipleProps
    const current = multi.value || []
    multi.onValueChange?.(
      current.includes(v) ? current.filter((x) => x !== v) : [...current, v]
    )
  }

  const removeMulti = (v: string) => {
    if (!multiple) return
    const multi = props as MultipleProps
    const current = multi.value || []
    multi.onValueChange?.(current.filter((x) => x !== v))
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange} modal={false}>
      <PopoverTrigger
        render={
          <Button
            id={id}
            variant='outline'
            role='combobox'
            aria-expanded={open}
            disabled={disabled}
            className={cn(
              'h-auto min-h-9 w-full items-center justify-start overflow-hidden py-1',
              className
            )}
          />
        }
      >
        <div className='mr-2 flex min-w-0 flex-1 flex-wrap gap-1'>
          {multiple && selectedMulti.length > 0 ? (
            <>
              {visibleMulti.map((o) => (
                <Badge
                  key={o.value}
                  variant='secondary'
                  className='mr-1 cursor-pointer'
                  onClick={(e) => {
                    e.stopPropagation()
                    onBadgeClick?.(o.value)
                  }}
                >
                  {o.label}
                  <button
                    type='button'
                    className='hover:bg-muted -my-1 -mr-1 ml-1 inline-flex size-6 items-center justify-center rounded-full outline-none'
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') removeMulti(o.value)
                    }}
                    onMouseDown={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                    }}
                    onClick={(e) => {
                      e.stopPropagation()
                      removeMulti(o.value)
                    }}
                  >
                    <X className='h-3 w-3' />
                  </button>
                </Badge>
              ))}
              {hiddenCount > 0 && (
                <Badge
                  variant='outline'
                  className='hover:bg-accent cursor-pointer'
                  onClick={(e) => {
                    e.stopPropagation()
                    setExpanded(false)
                  }}
                >
                  +{hiddenCount}
                </Badge>
              )}
              {!expanded && selectedMulti.length > VISIBLE_BADGES && (
                <Badge
                  variant='outline'
                  className='hover:bg-accent cursor-pointer text-xs'
                  onClick={(e) => {
                    e.stopPropagation()
                    setExpanded(true)
                  }}
                >
                  {t('Collapse')}
                </Badge>
              )}
            </>
          ) : !multiple && selectedOption ? (
            <div className='flex w-full items-center gap-2 overflow-hidden'>
              {selectedOption.icon && (
                <span className='shrink-0'>{selectedOption.icon}</span>
              )}
              <span className='truncate'>{selectedOption.label}</span>
            </div>
          ) : (
            <span className='text-muted-foreground truncate'>
              {placeholder}
            </span>
          )}
        </div>
        <ChevronsUpDown className='mt-0.5 h-4 w-4 shrink-0 self-start opacity-50' />
      </PopoverTrigger>
      <PopoverContent
        className='w-[var(--anchor-width)] min-w-[var(--anchor-width)] gap-0 p-0!'
        align='start'
        onWheel={(e) => e.stopPropagation()}
        onTouchMove={(e) => e.stopPropagation()}
      >
        <Command shouldFilter={false}>
          <CommandInput
            placeholder={searchPlaceholder}
            value={search}
            onValueChange={setSearch}
          />
          <CommandList
            style={{
              maxHeight,
              overflowY: 'auto',
              overflowX: 'hidden',
            }}
          >
            <CommandEmpty>{emptyText}</CommandEmpty>
            <CommandGroup>
              {filtered.map((o) => {
                const isSelected = multiple
                  ? Array.isArray(value) && value.includes(o.value)
                  : o.value === value
                return (
                  <CommandItem
                    key={o.value}
                    value={o.label}
                    disabled={o.disabled}
                    onSelect={() => {
                      if (o.isHeader) return
                      if (multiple) toggleMulti(o.value)
                      else selectSingle(o.value)
                    }}
                    className={cn(
                      o.isHeader &&
                        'bg-muted pointer-events-none sticky top-0 z-10 px-2 py-1 text-xs font-bold'
                    )}
                  >
                    {!o.isHeader && !hideCheck && (
                      <Check
                        className={cn(
                          'mr-2 h-4 w-4',
                          isSelected ? 'opacity-100' : 'opacity-0'
                        )}
                      />
                    )}
                    {o.icon && <span className='mr-2'>{o.icon}</span>}
                    <span className='truncate'>{o.label}</span>
                    {o.official && (
                      <Badge
                        variant='secondary'
                        className='ml-auto h-4 shrink-0 border-blue-200 bg-blue-50 px-1 text-[10px] font-medium text-blue-600'
                      >
                        {t('Official')}
                      </Badge>
                    )}
                  </CommandItem>
                )
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
