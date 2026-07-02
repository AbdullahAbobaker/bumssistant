// frontend/src/components/ChatView.test.tsx
import { render, screen } from '@testing-library/react'
import { expect, test, describe } from 'vitest'
import { ChatView, germanGreeting } from './ChatView'

describe('germanGreeting', () => {
  test('maps hours to German greetings', () => {
    expect(germanGreeting(8)).toBe('Guten Morgen')
    expect(germanGreeting(14)).toBe('Guten Tag')
    expect(germanGreeting(20)).toBe('Guten Abend')
    expect(germanGreeting(3)).toBe('Gute Nacht')
  })
})

describe('ChatView', () => {
  test('renders the chat composer and the sidebar widgets', () => {
    render(<ChatView onReviewClick={() => {}} />)
    expect(screen.getByLabelText('Nachricht')).toBeInTheDocument()      // ChatWidget composer
    expect(screen.getByText('Nutzerprofil')).toBeInTheDocument()        // ProfileCard
    expect(screen.getByText('Aufgaben')).toBeInTheDocument()            // TaskWidget
    expect(screen.getByText('2 Vorschläge zur Bestätigung')).toBeInTheDocument() // teaser
  })
})
