import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { DynamicListWidget } from './DynamicListWidget'

describe('DynamicListWidget', () => {
  it('renders title and items', () => {
    const items = [
      { label: 'Max Mustermann', content: 'Developer' },
      { label: 'Erika Musterfrau', content: 'Designer' }
    ]
    render(<DynamicListWidget title="Teammitglieder" items={items} />)
    screen.getByText('Teammitglieder')
    screen.getByText('Max Mustermann')
    screen.getByText('Developer')
    screen.getByText('Erika Musterfrau')
    screen.getByText('Designer')
  })
})
