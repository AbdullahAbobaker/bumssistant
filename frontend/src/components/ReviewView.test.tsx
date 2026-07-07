import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { beforeEach, expect, test, vi } from 'vitest'
import { ReviewView } from './ReviewView'
import * as api from '../api'

vi.mock('../api', () => ({
  listProposedMemories: vi.fn(),
  confirmMemory: vi.fn().mockResolvedValue({ id: 'm1', status: 'confirmed', changed: true }),
  rejectMemory: vi.fn().mockResolvedValue({ id: 'm1', status: 'rejected', changed: true }),
}))

const MEMORY = {
  id: 'm1', type: 'task', title: 'Q3-Report fertigstellen', note: 'bis Freitag',
  confidence: 0.7, source: 'ai_inferred', created_at: '2026-07-06T08:00:00+00:00',
}

beforeEach(() => {
  vi.mocked(api.listProposedMemories).mockReset().mockResolvedValue([MEMORY])
  vi.mocked(api.confirmMemory).mockClear()
  vi.mocked(api.rejectMemory).mockClear()
})

test('renders proposed memories as cards with type and confidence', async () => {
  render(<ReviewView />)
  expect(await screen.findByText('Q3-Report fertigstellen')).toBeInTheDocument()
  expect(screen.getByText('Aufgabe')).toBeInTheDocument()
  expect(screen.getByText('70 % sicher')).toBeInTheDocument()
})

test('Bestätigen confirms and removes the card', async () => {
  render(<ReviewView />)
  await screen.findByText('Q3-Report fertigstellen')
  fireEvent.click(screen.getByRole('button', { name: 'Bestätigen' }))
  await waitFor(() => expect(api.confirmMemory).toHaveBeenCalledWith('m1'))
  expect(screen.queryByText('Q3-Report fertigstellen')).not.toBeInTheDocument()
})

test('Ablehnen rejects and removes the card', async () => {
  render(<ReviewView />)
  await screen.findByText('Q3-Report fertigstellen')
  fireEvent.click(screen.getByRole('button', { name: 'Ablehnen' }))
  await waitFor(() => expect(api.rejectMemory).toHaveBeenCalledWith('m1'))
  expect(screen.queryByText('Q3-Report fertigstellen')).not.toBeInTheDocument()
})

test('shows the empty state when the queue is clear', async () => {
  vi.mocked(api.listProposedMemories).mockResolvedValue([])
  render(<ReviewView />)
  expect(await screen.findByText('Keine Vorschläge zur Bestätigung.')).toBeInTheDocument()
})
