import { render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import { ProfileCard } from './ProfileCard'

test('renders ProfileCard with user info', () => {
  render(<ProfileCard />)
  expect(screen.getByText('Abdullah')).toBeInTheDocument()
  expect(screen.getByText('Nutzerprofil')).toBeInTheDocument()
})
