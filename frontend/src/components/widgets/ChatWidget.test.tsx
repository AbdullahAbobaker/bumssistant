import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { expect, test, vi, beforeEach } from 'vitest'
import { ChatWidget } from './ChatWidget'

// Mock fetch globally
const mockFetch = vi.fn()
global.fetch = mockFetch as any

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
