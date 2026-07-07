// frontend/src/App.test.tsx
import { render, screen, fireEvent } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import App from './App'

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

test('renders the Chat view by default (composer + sidebar)', () => {
  render(<App />)
  expect(screen.getByLabelText('BumFlow')).toBeInTheDocument()          // rail logo
  expect(screen.getByLabelText('Nachricht')).toBeInTheDocument()        // chat composer
  expect(screen.getByText('Aufgaben')).toBeInTheDocument()              // sidebar TaskWidget
})

test('rail nav switches to Memory empty-state and back to Chat', () => {
  render(<App />)
  fireEvent.click(screen.getByRole('button', { name: 'Memory' }))
  // Query the empty-state <h2> by heading role — the rail also has a "Memory"
  // <span>, so getByText('Memory') would match twice and throw.
  expect(screen.getByRole('heading', { name: 'Memory' })).toBeInTheDocument()
  expect(screen.queryByLabelText('Nachricht')).not.toBeInTheDocument()  // composer gone

  fireEvent.click(screen.getByRole('button', { name: 'Chat' }))
  expect(screen.getByLabelText('Nachricht')).toBeInTheDocument()        // composer back
})

test('proposed-memories teaser navigates to the Review view', async () => {
  render(<App />)
  const teaserButton = await screen.findByRole('button', { name: /Vorschläge/ })
  fireEvent.click(teaserButton)
  expect(screen.getByRole('heading', { name: 'Review' })).toBeInTheDocument() // empty-state <h2>
  expect(screen.queryByLabelText('Nachricht')).not.toBeInTheDocument()
})
