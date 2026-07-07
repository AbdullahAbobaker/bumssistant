import { expect, test } from 'vitest'
import { COACHING_STYLES, COPY, TONE_PREVIEWS, firstAssistantMessage } from './content'

test('exposes the four coaching styles from app/onboarding/questions.py, in order', () => {
  expect(COACHING_STYLES).toEqual([
    'Direkt & fordernd',
    'Warm & ermutigend',
    'Ausgewogen',
    'Nur die Fakten',
  ])
})

test('every coaching style has a substantial tone preview', () => {
  for (const style of COACHING_STYLES) {
    expect(TONE_PREVIEWS[style].length).toBeGreaterThan(20)
  }
})

test('welcome copy interpolates the first name', () => {
  expect(COPY.welcome.headline('Anna')).toBe('Hallo, Anna.')
  expect(COPY.handoff.headline('Anna')).toBe('Ich bin bereit, Anna.')
})

test('first assistant message is distinct per style; Nur die Fakten skips small talk', () => {
  const messages = COACHING_STYLES.map(s => firstAssistantMessage(s, 'Anna'))
  expect(new Set(messages).size).toBe(COACHING_STYLES.length)
  expect(firstAssistantMessage('Nur die Fakten', 'Anna')).not.toContain('Anna')
})

test('handoff recap pluralizes correctly', () => {
  expect(COPY.handoff.memoriesConfirmed(1)).toBe('1 Erinnerung bestätigt')
  expect(COPY.handoff.memoriesConfirmed(3)).toBe('3 Erinnerungen bestätigt')
  expect(COPY.handoff.goalsNoted(1)).toBe('1 Ziel notiert')
})
