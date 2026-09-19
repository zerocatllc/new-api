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
import { fireEvent, render } from '@testing-library/react'
import { describe, expect, test, vi } from 'vitest'

import { DateTimePicker } from '../../datetime-picker'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en' },
  }),
}))

describe('DateTimePicker time input', () => {
  test('does not emit an invalid date while the time is being replaced', () => {
    const changes: Array<Date | undefined> = []
    const initialDate = new Date(2026, 6, 29, 0, 0)
    const { container } = render(
      <DateTimePicker
        value={initialDate}
        onChange={(date) => changes.push(date)}
      />
    )

    const input =
      container.querySelector<HTMLInputElement>('input[type="time"]')
    expect(input).not.toBeNull()
    if (!input) throw new Error('time input not found')

    fireEvent.change(input, { target: { value: '' } })

    expect(changes).toHaveLength(0)
    expect(container).not.toHaveTextContent('Invalid Date')

    fireEvent.change(input, { target: { value: '12:34' } })

    expect(changes).toHaveLength(1)
    expect(changes[0]).toBeInstanceOf(Date)
    expect(Number.isNaN(changes[0]?.getTime())).toBe(false)
    expect(changes[0]?.getHours()).toBe(12)
    expect(changes[0]?.getMinutes()).toBe(34)
  })

  test('treats an invalid controlled date as an empty value', () => {
    const { container } = render(
      <DateTimePicker value={new Date(Number.NaN)} />
    )

    const input =
      container.querySelector<HTMLInputElement>('input[type="time"]')
    expect(input).not.toBeNull()
    expect(input).toBeDisabled()
    expect(input).toHaveValue('00:00')
    expect(container).not.toHaveTextContent('Invalid Date')
    expect(container).toHaveTextContent('Select date')
  })
})
