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
  addMonths,
  endOfDay,
  endOfMonth,
  endOfWeek,
  format,
  startOfDay,
  startOfMonth,
  startOfWeek,
  subDays,
  subMonths,
} from 'date-fns'
import { enUS, zhCN } from 'date-fns/locale'
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from 'lucide-react'
import * as React from 'react'
import { type DateRange } from 'react-day-picker'
import { useTranslation } from 'react-i18next'

import { Button, buttonVariants } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { cn } from '@/lib/utils'

// Narrow Monday-first weekday glyphs, mirroring the reference (一 二 … 日).
const NARROW_WEEKDAY_ZH = ['日', '一', '二', '三', '四', '五', '六']

export interface DateRangePickerProps {
  start?: Date
  end?: Date
  onChange: (range: { start?: Date; end?: Date }) => void
  placeholder?: string
  className?: string
  /** Number of month panels shown side by side (reference uses 2). */
  numberOfMonths?: number
  contentAlign?: 'start' | 'center' | 'end'
}

/**
 * Calendar-based date range picker — a faithful port of the reference (:3011)
 * "Time Range" control: a dual-month range calendar with preset shortcuts and a
 * Confirm action. Picks whole-day ranges (start 00:00:00, end 23:59:59), so the
 * trigger always shows seconds. Replaces native `datetime-local` inputs.
 */
export function DateRangePicker({
  start,
  end,
  onChange,
  placeholder,
  className,
  numberOfMonths = 2,
  contentAlign = 'start',
}: DateRangePickerProps) {
  const { t, i18n } = useTranslation()
  const isZh = !i18n.language.startsWith('en')
  const locale = isZh ? zhCN : enUS
  const [open, setOpen] = React.useState(false)
  const [draft, setDraft] = React.useState<DateRange | undefined>()
  const [month, setMonth] = React.useState<Date>(start ?? new Date())

  const handleOpenChange = (next: boolean) => {
    if (next) {
      setDraft(start ? { from: start, to: end } : undefined)
      setMonth(start ?? new Date())
    }
    setOpen(next)
  }

  // Custom navigation: month arrows ‹ › plus year-jump arrows « », mirroring
  // the reference « ‹ 2026 - 06 › » header.
  const navBtn = cn(
    buttonVariants({ variant: 'ghost' }),
    'size-7 p-0 select-none'
  )
  const Nav = ({ className }: { className?: string }) => (
    <div
      className={cn(
        className,
        'flex w-full items-center justify-between gap-1'
      )}
    >
      <div className='flex items-center gap-1'>
        <button
          type='button'
          aria-label='Previous year'
          className={navBtn}
          onClick={() => setMonth(subMonths(month, 12))}
        >
          <ChevronsLeft className='size-4' />
        </button>
        <button
          type='button'
          aria-label='Previous month'
          className={navBtn}
          onClick={() => setMonth(subMonths(month, 1))}
        >
          <ChevronLeft className='size-4' />
        </button>
      </div>
      <div className='flex items-center gap-1'>
        <button
          type='button'
          aria-label='Next month'
          className={navBtn}
          onClick={() => setMonth(addMonths(month, 1))}
        >
          <ChevronRight className='size-4' />
        </button>
        <button
          type='button'
          aria-label='Next year'
          className={navBtn}
          onClick={() => setMonth(addMonths(month, 12))}
        >
          <ChevronsRight className='size-4' />
        </button>
      </div>
    </div>
  )

  const commit = (range?: DateRange) => {
    const r = range ?? draft
    if (!r?.from) {
      onChange({})
      setOpen(false)
      return
    }
    onChange({ start: startOfDay(r.from), end: endOfDay(r.to ?? r.from) })
    setOpen(false)
  }

  const presets: { label: string; make: () => DateRange }[] = [
    {
      label: t('Today'),
      make: () => {
        const n = new Date()
        return { from: startOfDay(n), to: endOfDay(n) }
      },
    },
    {
      label: t('Last 7 days'),
      make: () => {
        const n = new Date()
        return { from: startOfDay(subDays(n, 6)), to: endOfDay(n) }
      },
    },
    {
      label: t('This week'),
      make: () => {
        const n = new Date()
        return {
          from: startOfWeek(n, { weekStartsOn: 1 }),
          to: endOfWeek(n, { weekStartsOn: 1 }),
        }
      },
    },
    {
      label: t('Last 30 days'),
      make: () => {
        const n = new Date()
        return { from: startOfDay(subDays(n, 29)), to: endOfDay(n) }
      },
    },
    {
      label: t('This month'),
      make: () => {
        const n = new Date()
        return { from: startOfMonth(n), to: endOfMonth(n) }
      },
    },
  ]

  const fmt = (d: Date) => format(d, 'yy-M-d HH:mm:ss')
  const label = start
    ? `${fmt(start)} ~ ${end ? fmt(end) : ''}`
    : (placeholder ?? t('Time range'))

  const formatters = {
    formatCaption: (date: Date) =>
      `${date.getFullYear()} - ${String(date.getMonth() + 1).padStart(2, '0')}`,
    ...(isZh
      ? { formatWeekdayName: (date: Date) => NARROW_WEEKDAY_ZH[date.getDay()] }
      : {}),
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger
        render={
          <Button
            type='button'
            variant='outline'
            className={cn(
              'w-full justify-start gap-2 px-3 font-normal tabular-nums',
              !start && 'text-muted-foreground',
              className
            )}
          />
        }
      >
        <CalendarDays className='text-muted-foreground size-4 shrink-0' />
        <span className='truncate'>{label}</span>
      </PopoverTrigger>
      <PopoverContent align={contentAlign} className='w-auto p-3'>
        <div className='space-y-3'>
          <Calendar
            mode='range'
            numberOfMonths={numberOfMonths}
            selected={draft}
            onSelect={setDraft}
            month={month}
            onMonthChange={setMonth}
            locale={locale}
            formatters={formatters}
            components={{ Nav }}
          />
          <div className='flex flex-wrap items-center justify-between gap-2 border-t pt-2.5'>
            <div className='flex flex-wrap gap-1.5'>
              {presets.map((p) => (
                <Button
                  key={p.label}
                  type='button'
                  variant='outline'
                  size='sm'
                  className='h-7 px-2.5 text-xs'
                  onClick={() => {
                    const range = p.make()
                    setDraft(range)
                    if (range.from) setMonth(range.from)
                  }}
                >
                  {p.label}
                </Button>
              ))}
            </div>
            <Button size='sm' className='h-7' onClick={() => commit()}>
              {t('Confirm')}
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
