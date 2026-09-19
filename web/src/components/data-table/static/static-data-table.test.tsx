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
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, test } from 'vitest'

import { StaticDataTableMobileCards } from './static-data-table'

describe('StaticDataTableMobileCards', () => {
  test('keeps row actions visible without rendering a wide table', () => {
    const html = renderToStaticMarkup(
      <StaticDataTableMobileCards
        data={[
          { id: 1, name: 'alpha' },
          { id: 2, name: 'beta' },
        ]}
        getRowKey={(row) => row.id}
        columns={[
          {
            id: 'select',
            header: <button type='button'>Select all</button>,
            cell: (row) => <input aria-label={`Select ${row.name}`} />,
          },
          {
            id: 'name',
            header: 'Name',
            cell: (row) => row.name,
          },
          {
            id: 'actions',
            header: 'Actions',
            cell: (row) => (
              <button type='button' aria-label={`Edit ${row.name}`} />
            ),
          },
        ]}
      />
    )

    expect(html).toMatch(/data-slot="static-data-table-mobile"/)
    expect(html).not.toMatch(/<table/)
    expect(html).not.toMatch(/Select all/)
    expect(html).toMatch(/Edit alpha/)
    expect(html).toMatch(/Edit beta/)
  })
})
