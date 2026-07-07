// frontend/src/components/ChatView.test.tsx
import { render, screen } from '@testing-library/react'
import { expect, test, describe, vi } from 'vitest'
import { ChatView, germanGreeting } from './ChatView'

vi.mock('../api', () => ({
  getMe: vi.fn().mockResolvedValue({
    email: 'a@b.c', display_name: 'A', environment: 'development',
    warm_start_scan_mode: 'mock', onboarded: true,
  }),
  listTasks: vi.fn().mockResolvedValue([]),
  completeTask: vi.fn(),
  listProposedMemories: vi.fn().mockResolvedValue([{ id: 'm1' }, { id: 'm2' }, { id: 'm3' }]),
  getHistory: vi.fn().mockResolvedValue([]),
}))

describe('germanGreeting', () => {
  test('maps hours to German greetings', () => {
    expect(germanGreeting(8)).toBe('Guten Morgen')
    expect(germanGreeting(14)).toBe('Guten Tag')
    expect(germanGreeting(20)).toBe('Guten Abend')
    expect(germanGreeting(3)).toBe('Gute Nacht')
  })
})

describe('ChatView', () => {
  test('renders the chat composer and the sidebar widgets', () => {
    render(<ChatView onReviewClick={() => {}} />)
    expect(screen.getByLabelText('Nachricht')).toBeInTheDocument()      // ChatWidget composer
    expect(screen.getByText('Nutzerprofil')).toBeInTheDocument()        // ProfileCard
    expect(screen.getByText('Aufgaben')).toBeInTheDocument()            // TaskWidget
  })

  test('teaser shows the real proposed-memory count', async () => {
    render(<ChatView onReviewClick={() => {}} />)
    expect(await screen.findByText('3 Vorschläge zur Bestätigung')).toBeInTheDocument()
  })
})
