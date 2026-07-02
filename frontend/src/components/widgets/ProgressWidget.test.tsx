import { render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import { ProgressWidget } from './ProgressWidget'

test('renders ProgressWidget with progress', () => {
  render(<ProgressWidget />)
  expect(screen.getByText('Fortschritt')).toBeInTheDocument()
  expect(screen.getByText(/78%/i)).toBeInTheDocument()
  expect(screen.getByText('Abgeschlossen')).toBeInTheDocument()
})
