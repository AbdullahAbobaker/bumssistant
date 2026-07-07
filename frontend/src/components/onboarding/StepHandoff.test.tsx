import { render, screen, fireEvent } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import { StepHandoff } from './StepHandoff'

test('recaps tone, memories, and goals, and finishes on CTA', () => {
  const onFinish = vi.fn()
  render(
    <StepHandoff name="Anna" style="Direkt & fordernd" confirmedCount={3} goalsCount={1} onFinish={onFinish} />,
  )
  expect(screen.getByRole('heading', { name: 'Ich bin bereit, Anna.' })).toBeInTheDocument()
  expect(screen.getByText('Ton: Direkt & fordernd · 3 Erinnerungen bestätigt · 1 Ziel notiert')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Leg los' }))
  expect(onFinish).toHaveBeenCalledOnce()
})

test('omits zero-count recap segments', () => {
  render(
    <StepHandoff name="Anna" style="Ausgewogen" confirmedCount={0} goalsCount={0} onFinish={vi.fn()} />,
  )
  expect(screen.getByText('Ton: Ausgewogen')).toBeInTheDocument()
  expect(screen.queryByText(/bestätigt/)).not.toBeInTheDocument()
})
