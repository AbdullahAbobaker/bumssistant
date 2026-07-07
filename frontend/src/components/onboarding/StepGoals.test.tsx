import { render, screen, fireEvent } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import { StepGoals } from './StepGoals'

test('submits trimmed answers', () => {
  const onSubmit = vi.fn()
  render(<StepGoals onSubmit={onSubmit} />)
  fireEvent.change(
    screen.getByLabelText('Was willst du dieses Quartal wirklich schaffen?'),
    { target: { value: '  Q3-Angebot fertigstellen ' } },
  )
  fireEvent.change(
    screen.getByLabelText('Und was bringt dich zum Aufschieben?'),
    { target: { value: 'Unklare Anforderungen' } },
  )
  fireEvent.click(screen.getByRole('button', { name: 'Weiter' }))
  expect(onSubmit).toHaveBeenCalledWith({
    goals: 'Q3-Angebot fertigstellen',
    stress_triggers: 'Unklare Anforderungen',
  })
})

test('skip link submits empty answers', () => {
  const onSubmit = vi.fn()
  render(<StepGoals onSubmit={onSubmit} />)
  fireEvent.click(screen.getByRole('button', { name: 'Später im Chat erzählen' }))
  expect(onSubmit).toHaveBeenCalledWith({ goals: '', stress_triggers: '' })
})
