import { render, screen } from '@testing-library/react'
import { describe, it, vi, beforeEach, afterEach } from 'vitest'
import { CalendarWidget } from './CalendarWidget'

describe('CalendarWidget', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 6, 2)) // July 2, 2026
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders current month and year', () => {
    render(<CalendarWidget />)
    screen.getByText('Juli 2026')
    screen.getByText('2') // today
  })

  it('renders specific month and year', () => {
    render(<CalendarWidget month={11} year={2025} />)
    screen.getByText('Dezember 2025')
  })
})
