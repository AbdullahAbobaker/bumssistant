import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { beforeEach, expect, test, vi } from 'vitest'

vi.mock('./api', () => ({
  fetchReflections: vi.fn(),
  postAnswer: vi.fn(),
  resolveReflection: vi.fn(),
  completeOnboarding: vi.fn(),
}))

import { completeOnboarding, fetchReflections, postAnswer, resolveReflection } from './api'
import { OnboardingWizard } from './OnboardingWizard'

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(fetchReflections).mockResolvedValue([])
  vi.mocked(postAnswer).mockResolvedValue(undefined)
  vi.mocked(resolveReflection).mockResolvedValue(undefined)
  vi.mocked(completeOnboarding).mockResolvedValue(undefined)
})

test('happy path without reflections: welcome → tone → goals → handoff → onComplete', async () => {
  const onComplete = vi.fn()
  render(<OnboardingWizard displayName="Anna Muster" onComplete={onComplete} />)

  expect(screen.getByRole('heading', { name: 'Hallo, Anna.' })).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: "Los geht's" }))

  fireEvent.click(screen.getByRole('radio', { name: 'Nur die Fakten' }))
  fireEvent.click(screen.getByRole('button', { name: 'Weiter' }))
  await waitFor(() => expect(postAnswer).toHaveBeenCalledWith('coaching_style', 'Nur die Fakten'))

  // No reflections → step self-skips straight to goals
  expect(await screen.findByRole('heading', { name: 'Deine Ziele & Stolpersteine' })).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Später im Chat erzählen' }))

  expect(await screen.findByRole('heading', { name: 'Ich bin bereit, Anna.' })).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Leg los' }))
  await waitFor(() =>
    expect(onComplete).toHaveBeenCalledWith('Einrichtung abgeschlossen. Was steht heute an?'))
  expect(completeOnboarding).toHaveBeenCalledOnce()
})

test('reflections step appears when proposals exist and confirms via the API', async () => {
  vi.mocked(fetchReflections).mockResolvedValue([
    { id: 'r1', text: 'Du arbeitest oft mit Jira-Tickets.' },
  ])
  render(<OnboardingWizard displayName="Anna Muster" onComplete={vi.fn()} />)
  fireEvent.click(screen.getByRole('button', { name: "Los geht's" }))
  fireEvent.click(screen.getByRole('radio', { name: 'Ausgewogen' }))
  fireEvent.click(screen.getByRole('button', { name: 'Weiter' }))

  expect(await screen.findByRole('heading', { name: 'Bevor wir starten — stimmt das so?' })).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Stimmt' }))
  await waitFor(() => expect(resolveReflection).toHaveBeenCalledWith('r1', 'confirm', undefined))
  fireEvent.click(screen.getByRole('button', { name: 'Weiter' }))
  expect(await screen.findByRole('heading', { name: 'Deine Ziele & Stolpersteine' })).toBeInTheDocument()
})

test('optional answers are posted only when non-empty', async () => {
  render(<OnboardingWizard displayName="Anna Muster" onComplete={vi.fn()} />)
  fireEvent.click(screen.getByRole('button', { name: "Los geht's" }))
  fireEvent.click(screen.getByRole('radio', { name: 'Ausgewogen' }))
  fireEvent.click(screen.getByRole('button', { name: 'Weiter' }))
  await screen.findByRole('heading', { name: 'Deine Ziele & Stolpersteine' })

  fireEvent.change(
    screen.getByLabelText('Was willst du dieses Quartal wirklich schaffen?'),
    { target: { value: 'Q3-Angebot fertigstellen' } },
  )
  fireEvent.click(screen.getByRole('button', { name: 'Weiter' }))
  await waitFor(() => expect(postAnswer).toHaveBeenCalledWith('goals', 'Q3-Angebot fertigstellen'))
  expect(postAnswer).not.toHaveBeenCalledWith('stress_triggers', expect.anything())
  // Recap reflects the noted goal
  expect(await screen.findByText('Ton: Ausgewogen · 1 Ziel notiert')).toBeInTheDocument()
})

test('a failed save keeps the step and retry succeeds', async () => {
  vi.mocked(postAnswer).mockRejectedValueOnce(new Error('HTTP 500'))
  render(<OnboardingWizard displayName="Anna Muster" onComplete={vi.fn()} />)
  fireEvent.click(screen.getByRole('button', { name: "Los geht's" }))
  fireEvent.click(screen.getByRole('radio', { name: 'Direkt & fordernd' }))
  fireEvent.click(screen.getByRole('button', { name: 'Weiter' }))

  expect(await screen.findByText('Das hat nicht geklappt — nochmal versuchen?')).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'Wie soll ich mit dir sprechen?' })).toBeInTheDocument()

  fireEvent.click(screen.getByRole('button', { name: 'Nochmal versuchen' }))
  expect(await screen.findByRole('heading', { name: 'Deine Ziele & Stolpersteine' })).toBeInTheDocument()
})
