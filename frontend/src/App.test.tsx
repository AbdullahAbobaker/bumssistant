import { render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import App from './App'

test('renders App shell and widgets', () => {
  render(<App />)
  
  // Verify main layout
  expect(screen.getByLabelText('BumFlow')).toBeInTheDocument()
  
  // Verify chat area
  expect(screen.getByLabelText('Nachricht')).toBeInTheDocument()
  
  // Verify widgets in the right panel
  expect(screen.getByText('Aufgaben')).toBeInTheDocument()
  expect(screen.getByText('Fortschritt')).toBeInTheDocument()
  expect(screen.getByText('Nutzerprofil')).toBeInTheDocument()
})
