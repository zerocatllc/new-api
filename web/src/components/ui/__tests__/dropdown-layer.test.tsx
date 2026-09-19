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
import { render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../dropdown-menu'

test('renders dropdown portals above mobile sheets', () => {
  render(
    <DropdownMenu open>
      <DropdownMenuTrigger>Switch panel</DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem>Admin panel</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )

  const menu = screen.getByRole('menu')
  expect(menu).toHaveClass('z-70')
  expect(menu.parentElement).toHaveClass('z-70')
})
