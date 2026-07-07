import { render, screen, fireEvent } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import { StepWelcome } from './StepWelcome'

test('greets by first name, shows the trust line, and advances on CTA', () => {
  const onNext = vi.fn()
  render(<StepWelcome name="Anna" onNext={onNext} />)
  expect(screen.getByRole('heading', { name: 'Hallo, Anna.' })).toBeInTheDocument()
  expect(screen.getByText('Alles bleibt bei dir. Nichts wird ohne deine Bestätigung gespeichert.')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: "Los geht's" }))
  expect(onNext).toHaveBeenCalledOnce()
})
