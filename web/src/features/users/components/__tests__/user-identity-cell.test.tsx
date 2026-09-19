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
  flexRender,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table'
import { cleanup, render, screen } from '@testing-library/react'
import { createInstance } from 'i18next'
import { I18nextProvider } from 'react-i18next'
import { afterEach, expect, it } from 'vitest'

import type { User } from '../../types'
import { useUsersColumns } from '../users-columns'

const i18n = createInstance()
await i18n.init({
  lng: 'en',
  resources: { en: { translation: {} } },
  initAsync: false,
})

function IdentityTable(props: { user: Partial<User> }) {
  const columns = useUsersColumns().filter((column) =>
    ['username', 'email'].includes(
      'accessorKey' in column ? String(column.accessorKey) : String(column.id)
    )
  )
  const table = useReactTable({
    columns,
    data: [
      {
        id: 1,
        username: 'tester',
        display_name: '',
        role: 1,
        status: 1,
        quota: 0,
        used_quota: 0,
        request_count: 0,
        group: 'default',
        ...props.user,
      } as User,
    ],
    getCoreRowModel: getCoreRowModel(),
  })
  return (
    <table>
      <thead>
        {table.getHeaderGroups().map((group) => (
          <tr key={group.id}>
            {group.headers.map((header) => (
              <th key={header.id}>
                {flexRender(
                  header.column.columnDef.header,
                  header.getContext()
                )}
              </th>
            ))}
          </tr>
        ))}
      </thead>
      <tbody>
        {table.getRowModel().rows.map((row) => (
          <tr key={row.id}>
            {row.getVisibleCells().map((cell) => (
              <td key={cell.id}>
                {flexRender(cell.column.columnDef.cell, cell.getContext())}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

afterEach(() => cleanup())

it('shows a bound address in a dedicated email column', () => {
  render(
    <I18nextProvider i18n={i18n}>
      <IdentityTable
        user={{ email: 'someone@example.com', display_name: 'Someone' }}
      />
    </I18nextProvider>
  )
  expect(screen.getByRole('columnheader', { name: 'Email' })).toBeVisible()
  expect(
    screen.getByRole('cell', { name: 'someone@example.com' })
  ).toBeVisible()
})

it('shows the unbound state in the email column', () => {
  render(
    <I18nextProvider i18n={i18n}>
      <IdentityTable user={{ email: '' }} />
    </I18nextProvider>
  )
  expect(screen.getByRole('columnheader', { name: 'Email' })).toBeVisible()
  expect(screen.getByRole('cell', { name: 'Not bound' })).toBeVisible()
})
