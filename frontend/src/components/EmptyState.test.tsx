import { render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import { EmptyState } from './EmptyState'

test('renders the title', () => {
  render(<EmptyState title="Memory" />)
  expect(screen.getByText('Memory')).toBeInTheDocument()
})

test('renders the default hint when none given', () => {
  render(<EmptyState title="Review" />)
  expect(screen.getByText('Kommt bald…')).toBeInTheDocument()
})

test('renders a custom hint', () => {
  render(<EmptyState title="Settings" hint="Bald verfügbar" />)
  expect(screen.getByText('Bald verfügbar')).toBeInTheDocument()
})
