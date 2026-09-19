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

import { PagePrimaryAction } from './page-primary-action'

test('uses the shared branded create action and supports a compact mobile label', () => {
  render(
    <PagePrimaryAction aria-label='Create API Key' mobileLabel='Create'>
      Create API Key
    </PagePrimaryAction>
  )

  const button = screen.getByRole('button', { name: 'Create API Key' })
  expect(button).toHaveClass('h-9', 'rounded-xl', 'px-4', 'shadow-xs')
  expect(button.querySelector('svg')).toHaveAttribute(
    'data-icon',
    'inline-start'
  )
  expect(screen.getByText('Create API Key')).toHaveClass('max-sm:hidden')
  expect(screen.getByText('Create')).toHaveClass('sm:hidden')
})
