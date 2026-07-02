import { render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import App from './App'

test('renders sidebar with German headings', () => {
  render(<App />)
  expect(screen.getByText('Aktive Projekte')).toBeInTheDocument()
  expect(screen.getByText('Heute fällig')).toBeInTheDocument()
})
