import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { beforeEach, expect, test, vi } from 'vitest'
import { TaskWidget } from './TaskWidget'
import * as api from '../../api'

vi.mock('../../api', () => ({
  listTasks: vi.fn(),
  completeTask: vi.fn().mockResolvedValue({ id: 't1', state: 'done', changed: true }),
}))

const TASK = {
  id: 't1', title: 'Review schreiben', note: null,
  due_at: '2026-07-06T09:00:00+00:00', state: 'open', overdue: true,
}

beforeEach(() => {
  vi.mocked(api.listTasks).mockReset().mockResolvedValue([TASK])
  vi.mocked(api.completeTask).mockClear()
})

test('renders tasks from the backend', async () => {
  render(<TaskWidget />)
  expect(await screen.findByText('Review schreiben')).toBeInTheDocument()
})

test('checkbox completes the task and removes it optimistically', async () => {
  render(<TaskWidget />)
  await screen.findByText('Review schreiben')
  vi.mocked(api.listTasks).mockResolvedValue([]) // refetch after completion
  fireEvent.click(screen.getByRole('checkbox', { name: 'Review schreiben erledigen' }))
  await waitFor(() => expect(api.completeTask).toHaveBeenCalledWith('t1'))
  expect(screen.queryByText('Review schreiben')).not.toBeInTheDocument()
})

test('shows the empty state when there are no open tasks', async () => {
  vi.mocked(api.listTasks).mockResolvedValue([])
  render(<TaskWidget />)
  expect(await screen.findByText('Keine offenen Aufgaben.')).toBeInTheDocument()
})
