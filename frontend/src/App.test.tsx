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

// Stub the wizard so the handoff test can fire onComplete deterministically
// without driving all five steps — it's App's threading of the message we guard here.
vi.mock('./components/onboarding/OnboardingWizard', () => ({
  OnboardingWizard: ({ onComplete }: { onComplete: (msg: string) => void }) => (
    <button onClick={() => onComplete('BumFlow begrüßt dich in deinem Ton.')}>
      finish-wizard
    </button>
  ),
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
  // Wait for the chat composer which appears after /me resolves
  expect(await screen.findByLabelText('Nachricht')).toBeInTheDocument()
  expect(screen.getByText('BF')).toBeInTheDocument()                       // rail logo
  expect(screen.getByText('Aufgaben')).toBeInTheDocument()                 // sidebar TaskWidget
  // Wait for proposed memories teaser (async fetch in ChatView useEffect)
  expect(await screen.findByText('2 Vorschläge zur Bestätigung')).toBeInTheDocument()
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
  // Wizard is stubbed here (see top-of-file mock); its own suite covers its steps.
  // This guards App's routing: wizard shown, chat shell withheld.
  vi.mocked(fetchMe).mockResolvedValue({
    email: 'anna@bumg.de', display_name: 'Anna Muster', onboarded: false,
  })
  render(<App />)
  expect(await screen.findByRole('button', { name: 'finish-wizard' })).toBeInTheDocument()
  expect(screen.queryByLabelText('Nachricht')).not.toBeInTheDocument()     // no shell yet
})

test('seeds BumFlow\'s handoff message into the chat after onboarding completes', async () => {
  vi.mocked(fetchMe).mockResolvedValue({
    email: 'anna@bumg.de', display_name: 'Anna Muster', onboarded: false,
  })
  render(<App />)
  fireEvent.click(await screen.findByRole('button', { name: 'finish-wizard' }))
  // Shell now renders and ChatWidget shows the tone-specific first message.
  expect(await screen.findByText('BumFlow begrüßt dich in deinem Ton.')).toBeInTheDocument()
  expect(screen.getByLabelText('Nachricht')).toBeInTheDocument()           // chat shell mounted
})

test('keeps the normal shell when /me is unavailable', async () => {
  vi.mocked(fetchMe).mockRejectedValue(new Error('HTTP 500'))
  render(<App />)
  expect(await screen.findByLabelText('Nachricht')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'finish-wizard' })).not.toBeInTheDocument()
})
