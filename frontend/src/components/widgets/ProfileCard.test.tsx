import { render, screen } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import { ProfileCard } from './ProfileCard'

vi.mock('../../api', () => ({
  getMe: vi.fn().mockResolvedValue({
    email: 'aa@bumg.de', display_name: 'Abdullah Abobaker',
    environment: 'development', warm_start_scan_mode: 'mock', onboarded: true,
  }),
}))

test('shows the real display name from /me', async () => {
  render(<ProfileCard />)
  expect(await screen.findByText('Abdullah Abobaker')).toBeInTheDocument()
  expect(screen.getByText('A')).toBeInTheDocument() // avatar initial
})
