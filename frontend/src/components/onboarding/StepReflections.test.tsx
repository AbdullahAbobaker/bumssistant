import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import { StepReflections } from './StepReflections'

const TWO = [
  { id: 'r1', text: 'Du hast montags viele Meetings.' },
  { id: 'r2', text: 'Du arbeitest oft an Angeboten.' },
]

test('Stimmt confirms and seals; Anpassen saves edited text; Weiter reports the count', async () => {
  const onResolve = vi.fn().mockResolvedValue(undefined)
  const onDone = vi.fn()
  render(<StepReflections reflections={TWO} onResolve={onResolve} onDone={onDone} />)

  fireEvent.click(screen.getAllByRole('button', { name: 'Stimmt' })[0])
  await waitFor(() => expect(onResolve).toHaveBeenCalledWith('r1', 'confirm', undefined))
  expect(screen.getAllByRole('listitem')[0].className).toContain('confirmed')

  fireEvent.click(screen.getByRole('button', { name: 'Anpassen' }))
  fireEvent.change(screen.getByLabelText('Erinnerung bearbeiten'), {
    target: { value: 'Du arbeitest oft an Ausschreibungen.' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Speichern' }))
  await waitFor(() =>
    expect(onResolve).toHaveBeenCalledWith('r2', 'confirm', 'Du arbeitest oft an Ausschreibungen.'))

  fireEvent.click(screen.getByRole('button', { name: 'Weiter' }))
  expect(onDone).toHaveBeenCalledWith(2)
})

test('Löschen dismisses and does not count as confirmed', async () => {
  const onResolve = vi.fn().mockResolvedValue(undefined)
  const onDone = vi.fn()
  render(<StepReflections reflections={[TWO[0]]} onResolve={onResolve} onDone={onDone} />)
  fireEvent.click(screen.getByRole('button', { name: 'Löschen' }))
  await waitFor(() => expect(onResolve).toHaveBeenCalledWith('r1', 'dismiss', undefined))
  fireEvent.click(screen.getByRole('button', { name: 'Weiter' }))
  expect(onDone).toHaveBeenCalledWith(0)
})

test('a failed resolve shows the error and keeps the card actionable', async () => {
  const onResolve = vi.fn().mockRejectedValue(new Error('HTTP 500'))
  render(<StepReflections reflections={[TWO[0]]} onResolve={onResolve} onDone={vi.fn()} />)
  fireEvent.click(screen.getByRole('button', { name: 'Stimmt' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Das hat nicht geklappt — nochmal versuchen?')
  expect(screen.getByRole('button', { name: 'Stimmt' })).toBeInTheDocument()
})
