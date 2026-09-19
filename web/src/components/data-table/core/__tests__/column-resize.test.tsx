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
  getCoreRowModel,
  useReactTable,
  type ColumnSizingState,
} from '@tanstack/react-table'
import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { expect, it } from 'vitest'

import { DataTableHeader } from '../data-table-header'

function ResizeFixture({ enabled }: { enabled: boolean }) {
  const [columnSizing, setColumnSizing] = useState<ColumnSizingState>({})
  const table = useReactTable({
    data: [{ name: 'Alice' }],
    columns: [{ accessorKey: 'name', header: 'Name', size: 150 }],
    state: { columnSizing },
    onColumnSizingChange: setColumnSizing,
    getCoreRowModel: getCoreRowModel(),
    enableColumnResizing: enabled,
  })

  return (
    <>
      <table>
        <DataTableHeader table={table} applyHeaderSize />
      </table>
      <output data-testid='width'>{table.getColumn('name')?.getSize()}</output>
    </>
  )
}

it('lets an enabled table resize a column by keyboard', () => {
  render(<ResizeFixture enabled />)
  const handle = screen.getByRole('separator', { name: 'Resize column' })
  fireEvent.keyDown(handle, { key: 'ArrowRight' })
  expect(screen.getByTestId('width')).toHaveTextContent('160')
})

it('omits the resize handle when a table disables resizing', () => {
  render(<ResizeFixture enabled={false} />)
  expect(
    screen.queryByRole('separator', { name: 'Resize column' })
  ).not.toBeInTheDocument()
})
