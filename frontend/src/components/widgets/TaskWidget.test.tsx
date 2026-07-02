import { render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import { TaskWidget } from './TaskWidget'

test('renders TaskWidget with tasks', () => {
  render(<TaskWidget />)
  expect(screen.getByText('Aufgaben')).toBeInTheDocument()
  expect(screen.getByText('Interview')).toBeInTheDocument()
  expect(screen.getByText('Team-Meeting')).toBeInTheDocument()
  expect(screen.getByText('Projekt Update')).toBeInTheDocument()
})
