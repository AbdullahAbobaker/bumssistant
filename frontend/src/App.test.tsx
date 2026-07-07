// frontend/src/App.test.tsx
import { render, screen, fireEvent } from '@testing-library/react'
import { beforeEach, expect, test, vi } from 'vitest'

vi.mock('./components/onboarding/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./components/onboarding/api')>()
  return {
    ...actual,
    fetchMe: vi.fn(),
    fetchReflections: vi.fn().mockResolvedValue([]),
  }
})

vi.mock('./api', () => ({
  getMe: vi.fn().mockResolvedValue({
    email: 'a@b.c', display_name: 'A', environment: 'development',
    warm_start_scan_mode: 'mock', onboarded: true,
  }),
  listTasks: vi.fn().mockResolvedValue([]),
  completeTask: vi.fn(),
  listProposedMemories: vi.fn().mockResolvedValue([{ id: 'm1' }, { id: 'm2' }]),
  confirmMemory: vi.fn().mockResolvedValue({ id: 'm1', status: 'confirmed', changed: true }),
  rejectMemory: vi.fn().mockResolvedValue({ id: 'm1', status: 'rejected', changed: true }),
  getHistory: vi.fn().mockResolvedValue([]),
}))

import { fetchMe } from './components/onboarding/api'
import App from './App'

beforeEach(() => {
  vi.mocked(fetchMe).mockResolvedValue({
    email: 'test@bumg.de', display_name: 'Test User', onboarded: true,
  })
})

test('renders the Chat view by default (composer + sidebar)', async () => {
  render(<App />)
  expect(await screen.findByLabelText('BumFlow')).toBeInTheDocument()      // rail logo
  expect(screen.getByLabelText('Nachricht')).toBeInTheDocument()           // chat composer
  expect(screen.getByText('Aufgaben')).toBeInTheDocument()                 // sidebar TaskWidget
  expect(screen.getByText('2 Vorschläge zur Bestätigung')).toBeInTheDocument()
})

test('rail nav switches to Memory empty-state and back to Chat', async () => {
  render(<App />)
  fireEvent.click(await screen.findByRole('button', { name: 'Memory' }))
  // Query the empty-state <h2> by heading role — the rail also has a "Memory"
  // <span>, so getByText('Memory') would match twice and throw.
  expect(screen.getByRole('heading', { name: 'Memory' })).toBeInTheDocument()
  expect(screen.queryByLabelText('Nachricht')).not.toBeInTheDocument()     // composer gone

  fireEvent.click(screen.getByRole('button', { name: 'Chat' }))
  expect(screen.getByLabelText('Nachricht')).toBeInTheDocument()           // composer back
})

test('proposed-memories teaser navigates to the Review view', async () => {
  render(<App />)
  fireEvent.click(await screen.findByRole('button', { name: /Vorschläge/ }))
  expect(screen.getByRole('heading', { name: 'Review' })).toBeInTheDocument() // empty-state <h2>
  expect(screen.queryByLabelText('Nachricht')).not.toBeInTheDocument()
})

test('mounts the onboarding wizard when /me says onboarding is incomplete', async () => {
  vi.mocked(fetchMe).mockResolvedValue({
    email: 'anna@bumg.de', display_name: 'Anna Muster', onboarded: false,
  })
  render(<App />)
  expect(await screen.findByRole('heading', { name: 'Hallo, Anna.' })).toBeInTheDocument()
  expect(screen.queryByLabelText('Nachricht')).not.toBeInTheDocument()     // no shell yet
})

test('keeps the normal shell when /me is unavailable', async () => {
  vi.mocked(fetchMe).mockRejectedValue(new Error('HTTP 500'))
  render(<App />)
  expect(await screen.findByLabelText('Nachricht')).toBeInTheDocument()
  expect(screen.queryByRole('heading', { name: /Hallo,/ })).not.toBeInTheDocument()
})
