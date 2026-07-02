import { render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import App from './App'

test('renders TopNav and WelcomeHeader', () => {
  render(<App />)
  // Verify TopNav
  expect(screen.getByText('BumFlow')).toBeInTheDocument()
  expect(screen.getByText('Dashboard')).toBeInTheDocument()
  expect(screen.getByText('Projekte')).toBeInTheDocument()
  
  // Verify WelcomeHeader
  expect(screen.getByText('Willkommen, Abdullah')).toBeInTheDocument()
  
  // Verify chat area
  expect(screen.getByLabelText('Nachricht an BumFlow')).toBeInTheDocument()
  expect(screen.getByText('Senden')).toBeInTheDocument()
})
