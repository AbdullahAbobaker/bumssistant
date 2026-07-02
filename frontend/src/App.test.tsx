// frontend/src/App.test.tsx
import { render, screen, fireEvent } from '@testing-library/react'
import { expect, test } from 'vitest'
import App from './App'

test('renders the Chat view by default (composer + sidebar)', () => {
  render(<App />)
  expect(screen.getByLabelText('BumFlow')).toBeInTheDocument()          // rail logo
  expect(screen.getByLabelText('Nachricht')).toBeInTheDocument()        // chat composer
  expect(screen.getByText('Aufgaben')).toBeInTheDocument()              // sidebar TaskWidget
  expect(screen.getByText('2 Vorschläge zur Bestätigung')).toBeInTheDocument()
})

test('rail nav switches to Memory empty-state and back to Chat', () => {
  render(<App />)
  fireEvent.click(screen.getByRole('button', { name: 'Memory' }))
  // Query the empty-state <h2> by heading role — the rail also has a "Memory"
  // <span>, so getByText('Memory') would match twice and throw.
  expect(screen.getByRole('heading', { name: 'Memory' })).toBeInTheDocument()
  expect(screen.queryByLabelText('Nachricht')).not.toBeInTheDocument()  // composer gone

  fireEvent.click(screen.getByRole('button', { name: 'Chat' }))
  expect(screen.getByLabelText('Nachricht')).toBeInTheDocument()        // composer back
})

test('proposed-memories teaser navigates to the Review view', () => {
  render(<App />)
  fireEvent.click(screen.getByRole('button', { name: /Vorschläge/ }))
  expect(screen.getByRole('heading', { name: 'Review' })).toBeInTheDocument() // empty-state <h2>
  expect(screen.queryByLabelText('Nachricht')).not.toBeInTheDocument()
})
