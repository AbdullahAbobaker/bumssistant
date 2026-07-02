import { render, screen, fireEvent } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import { ProposedMemoriesTeaser } from './ProposedMemoriesTeaser'

test('renders the count and German label', () => {
  render(<ProposedMemoriesTeaser count={2} onReview={() => {}} />)
  expect(screen.getByText('2 Vorschläge zur Bestätigung')).toBeInTheDocument()
})

test('calls onReview when clicked', () => {
  const onReview = vi.fn()
  render(<ProposedMemoriesTeaser count={2} onReview={onReview} />)
  fireEvent.click(screen.getByRole('button', { name: /Vorschläge/ }))
  expect(onReview).toHaveBeenCalledOnce()
})
