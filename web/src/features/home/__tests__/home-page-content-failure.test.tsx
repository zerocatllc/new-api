/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'

import { useHomePageContent } from '../hooks'

const getHomePageContent = vi.hoisted(() => vi.fn())
const toastError = vi.hoisted(() => vi.fn())

vi.mock('../api', () => ({ getHomePageContent }))
vi.mock('sonner', () => ({ toast: { error: toastError } }))

function HomeContentState() {
  const result = useHomePageContent()
  return <div>{result.isLoaded ? `loaded:${result.content}` : 'loading'}</div>
}

afterEach(() => {
  localStorage.clear()
  getHomePageContent.mockReset()
  toastError.mockReset()
  vi.restoreAllMocks()
})

test('failed optional homepage content refresh keeps the fallback page quiet', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
  getHomePageContent.mockRejectedValue(new Error('gateway timeout'))

  render(<HomeContentState />)

  expect(await screen.findByText('loaded:')).toBeInTheDocument()
  expect(toastError).not.toHaveBeenCalled()
})

test('business failure preserves the last known custom homepage content', async () => {
  localStorage.setItem('home_page_content', 'cached content')
  getHomePageContent.mockResolvedValue({
    success: false,
    data: '',
    message: 'temporarily unavailable',
  })

  render(<HomeContentState />)

  expect(await screen.findByText('loaded:cached content')).toBeInTheDocument()
  expect(localStorage.getItem('home_page_content')).toBe('cached content')
})

test('successful empty response clears custom homepage content', async () => {
  localStorage.setItem('home_page_content', 'cached content')
  getHomePageContent.mockResolvedValue({ success: true, data: '' })

  render(<HomeContentState />)

  await waitFor(() => {
    expect(localStorage.getItem('home_page_content')).toBeNull()
  })
  expect(screen.getByText('loaded:')).toBeInTheDocument()
})
