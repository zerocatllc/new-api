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
import { render } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, test, vi } from 'vitest'

type WrapperProps = {
  children?: ReactNode
  heading?: string
  open?: boolean
}

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => () => undefined,
}))
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))
vi.mock('@/context/search-context', () => ({
  useSearch: () => ({ open: true, setOpen: () => undefined }),
}))
vi.mock('@/context/theme-provider', () => ({
  useTheme: () => ({ setTheme: () => undefined }),
}))
vi.mock('@/hooks/use-sidebar-view', () => ({
  useSidebarView: () => ({
    key: '__root',
    view: null,
    navGroups: [
      {
        id: 'allowed',
        title: 'Allowed',
        items: [{ title: 'Wallet', url: '/wallet' }],
      },
    ],
  }),
}))
vi.mock('@/components/ui/command', () => ({
  Command: ({ children }: WrapperProps) => <div>{children}</div>,
  CommandDialog: ({ children, open }: WrapperProps) =>
    open ? <div>{children}</div> : null,
  CommandEmpty: ({ children }: WrapperProps) => <div>{children}</div>,
  CommandGroup: ({ children, heading }: WrapperProps) => (
    <section>
      <h2>{heading}</h2>
      {children}
    </section>
  ),
  CommandInput: () => <input />,
  CommandItem: ({ children }: WrapperProps) => <div>{children}</div>,
  CommandList: ({ children }: WrapperProps) => <div>{children}</div>,
  CommandSeparator: () => <hr />,
}))
vi.mock('./ui/scroll-area', () => ({
  ScrollArea: ({ children }: WrapperProps) => <div>{children}</div>,
}))

const { CommandMenu } = await import('./command-menu')

describe('CommandMenu route access', () => {
  test('renders only the access-filtered sidebar view', () => {
    const { container } = render(<CommandMenu />)

    expect(container).toHaveTextContent('Wallet')
    expect(container).not.toHaveTextContent('Secret system settings')
  })
})
