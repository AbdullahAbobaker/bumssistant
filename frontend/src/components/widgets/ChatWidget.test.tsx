import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { expect, test, vi, beforeEach } from 'vitest'
import { ChatWidget } from './ChatWidget'

vi.mock('../../api', () => ({
  getHistory: vi.fn().mockResolvedValue([
    { role: 'briefing', content: 'Guten Morgen! 2 Aufgaben heute.', created_at: '2026-07-06T07:00:00+00:00' },
    { role: 'user', content: 'Danke!', created_at: '2026-07-06T07:01:00+00:00' },
    { role: 'assistant', content: 'Gern!', created_at: '2026-07-06T07:01:05+00:00' },
  ]),
}))

// Mock fetch globally
const mockFetch = vi.fn()
globalThis.fetch = mockFetch as unknown as typeof fetch

beforeEach(() => {
  mockFetch.mockReset()
  // By default, successful JSON response
  mockFetch.mockResolvedValue({
    ok: true,
    json: async () => ({ reply: 'Hallo vom Backend' }),
  })

})

test('renders chat widget and handles message submission', async () => {
  render(<ChatWidget />)

  // Verify empty state
  expect(screen.getByText('Guten Tag!')).toBeInTheDocument()

  // Find textarea and send button
  const input = screen.getByLabelText('Nachricht')
  const sendBtn = screen.getByLabelText('Senden')

  // Type a message
  fireEvent.change(input, { target: { value: 'Hallo BumFlow' } })
  expect(input).toHaveValue('Hallo BumFlow')

  // Send the message
  fireEvent.click(sendBtn)

  // Text should clear
  expect(input).toHaveValue('')

  // The user message should appear immediately
  expect(screen.getByText('Hallo BumFlow')).toBeInTheDocument()

  // Verify fetch was called with correct proxy URL
  expect(mockFetch).toHaveBeenCalledWith('/chat', expect.objectContaining({
    method: 'POST',
    body: JSON.stringify({ message: 'Hallo BumFlow' }),
    headers: { 'Content-Type': 'application/json' },
  }))

  // Wait for the mock assistant reply
  await waitFor(() => {
    expect(screen.getByText('Hallo vom Backend')).toBeInTheDocument()
  })
})

test('hydrates the thread from /chat/history on mount', async () => {
  render(<ChatWidget />)
  expect(await screen.findByText('Danke!')).toBeInTheDocument()
  expect(screen.getByText('Gern!')).toBeInTheDocument()
})

test('briefing messages render with the briefing style', async () => {
  render(<ChatWidget />)
  const briefing = await screen.findByText('Guten Morgen! 2 Aufgaben heute.')
  expect(briefing.closest('.message')).toHaveClass('briefing')
})

test('seeds an initial assistant message after a typing beat', async () => {
  vi.useFakeTimers()
  try {
    render(<ChatWidget initialAssistantMessage="Einrichtung abgeschlossen. Was steht heute an?" />)
    // While "typing", the empty state must NOT show — the typing dots do
    expect(document.querySelector('.typing-indicator')).toBeInTheDocument()
    await act(async () => { vi.advanceTimersByTime(1000) })
    expect(screen.getByText('Einrichtung abgeschlossen. Was steht heute an?')).toBeInTheDocument()
    expect(document.querySelector('.typing-indicator')).not.toBeInTheDocument()
  } finally {
    vi.useRealTimers()
  }
})

