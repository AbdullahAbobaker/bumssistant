import { render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import { TonePreview } from './TonePreview'

test('renders the preview copy for the given style', () => {
  render(<TonePreview style="Nur die Fakten" />)
  expect(screen.getByRole('status')).toHaveTextContent(
    'Quartalsbericht: fällig morgen, 17:00. Offener Slot heute: 14:00–15:00.',
  )
})

test('re-rendering with a new style swaps the copy', () => {
  const { rerender } = render(<TonePreview style="Ausgewogen" />)
  expect(screen.getByRole('status')).toHaveTextContent('soll ich dir einen Block freihalten?')
  rerender(<TonePreview style="Direkt & fordernd" />)
  expect(screen.getByRole('status')).toHaveTextContent('Du hast ihn dreimal verschoben.')
})
