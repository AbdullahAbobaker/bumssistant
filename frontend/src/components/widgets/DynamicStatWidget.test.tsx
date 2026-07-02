import { render, screen } from '@testing-library/react'
import { describe, it } from 'vitest'
import { DynamicStatWidget } from './DynamicStatWidget'

describe('DynamicStatWidget', () => {
  it('renders title and value', () => {
    render(<DynamicStatWidget title="Urlaubsanspruch" value="28 Tage" />)
    screen.getByText('Urlaubsanspruch')
    screen.getByText('28 Tage')
  })
})
