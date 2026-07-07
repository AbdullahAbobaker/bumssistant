import { render, screen, fireEvent } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import { StepTone } from './StepTone'

test('renders all four styles as radios; CTA disabled until one is chosen', () => {
  const onSubmit = vi.fn()
  render(<StepTone onSubmit={onSubmit} />)
  expect(screen.getAllByRole('radio')).toHaveLength(4)
  const cta = screen.getByRole('button', { name: 'Weiter' })
  expect(cta).toBeDisabled()
  fireEvent.click(cta)
  expect(onSubmit).not.toHaveBeenCalled()
})

test('selecting a style shows its live preview and enables submit', () => {
  const onSubmit = vi.fn()
  render(<StepTone onSubmit={onSubmit} />)
  fireEvent.click(screen.getByRole('radio', { name: 'Warm & ermutigend' }))
  expect(screen.getByRole('status')).toHaveTextContent('Der Quartalsbericht wartet noch auf dich.')
  fireEvent.click(screen.getByRole('radio', { name: 'Nur die Fakten' }))
  expect(screen.getByRole('status')).toHaveTextContent('Quartalsbericht: fällig morgen, 17:00.')
  fireEvent.click(screen.getByRole('button', { name: 'Weiter' }))
  expect(onSubmit).toHaveBeenCalledWith('Nur die Fakten')
})
