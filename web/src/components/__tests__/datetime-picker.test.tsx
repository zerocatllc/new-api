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
import { cleanup, render, screen } from '@testing-library/react'
import { createInstance } from 'i18next'
import { I18nextProvider } from 'react-i18next'
import { afterEach, expect, it } from 'vitest'

import { DateTimePicker } from '../datetime-picker'

const i18n = createInstance()
await i18n.init({
  lng: 'en',
  resources: { en: { translation: {} } },
  initAsync: false,
})

afterEach(() => cleanup())

it('exposes accessible names for the date trigger and time input when ariaLabel is set', () => {
  render(
    <I18nextProvider i18n={i18n}>
      <DateTimePicker ariaLabel='Expiry' value={new Date(2026, 0, 1, 8, 30)} />
    </I18nextProvider>
  )
  expect(screen.getByRole('button', { name: 'Expiry' })).toBeInTheDocument()
  expect(screen.getByLabelText('Expiry time')).toHaveValue('08:30')
})

it('adds no aria-label attributes when ariaLabel is omitted', () => {
  render(
    <I18nextProvider i18n={i18n}>
      <DateTimePicker value={new Date(2026, 0, 1, 8, 30)} />
    </I18nextProvider>
  )
  const trigger = screen.getByRole('button', { name: /2026-01-01/ })
  expect(trigger).not.toHaveAttribute('aria-label')
  const timeInput = document.querySelector('input[type="time"]')
  expect(timeInput).not.toHaveAttribute('aria-label')
})
