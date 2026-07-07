// German onboarding copy — mirrors app/onboarding/questions.py.
// The single source of truth for COLD_QUESTIONS stays in Python; update this
// file whenever COACHING_STYLES or question keys change there.

export const COACHING_STYLES = [
  'Direkt & fordernd',
  'Warm & ermutigend',
  'Ausgewogen',
  'Nur die Fakten',
] as const

export type CoachingStyle = (typeof COACHING_STYLES)[number]

// Same scenario in all four tones (a report due tomorrow) — the user feels
// the difference instead of reading about it.
export const TONE_PREVIEWS: Record<CoachingStyle, string> = {
  'Direkt & fordernd':
    'Der Quartalsbericht ist morgen fällig. Du hast ihn dreimal verschoben. Heute 14 Uhr — 45 Minuten, ich halte dir den Rücken frei.',
  'Warm & ermutigend':
    'Der Quartalsbericht wartet noch auf dich. Wie wäre ein kleiner Anfang heute Nachmittag? Zehn Minuten reichen für den Einstieg.',
  'Ausgewogen':
    'Erinnerung: Quartalsbericht bis morgen. Heute Nachmittag wäre ein guter Zeitpunkt — soll ich dir einen Block freihalten?',
  'Nur die Fakten':
    'Quartalsbericht: fällig morgen, 17:00. Offener Slot heute: 14:00–15:00.',
}

export const COPY = {
  welcome: {
    headline: (name: string) => `Hallo, ${name}.`,
    body:
      'Ich bin BumFlow — dein Arbeitsgedächtnis, dein Fokus-Coach, dein Anti-Aufschieber. ' +
      'In 90 Sekunden bin ich auf dich eingestellt. Danach vergesse ich nie wieder, was dir wichtig ist.',
    cta: "Los geht's",
    trust: 'Alles bleibt bei dir. Nichts wird ohne deine Bestätigung gespeichert.',
  },
  tone: {
    headline: 'Wie soll ich mit dir sprechen?',
    footer: 'Jederzeit änderbar — sag es mir einfach im Chat.',
    cta: 'Weiter',
  },
  reflections: {
    headline: 'Bevor wir starten — stimmt das so?',
    subline: 'Ich schlage nur vor. Du entscheidest, was ich behalte.',
    confirm: 'Stimmt',
    edit: 'Anpassen',
    dismiss: 'Löschen',
    save: 'Speichern',
    editLabel: 'Erinnerung bearbeiten',
    cta: 'Weiter',
  },
  goals: {
    headline: 'Deine Ziele & Stolpersteine',
    goalLabel: 'Was willst du dieses Quartal wirklich schaffen?',
    goalHelp: 'optional — hilft mir, deine Prioritäten zu erkennen',
    stressLabel: 'Und was bringt dich zum Aufschieben?',
    stressHelp: 'optional — damit ich im richtigen Moment helfe statt nerve',
    skip: 'Später im Chat erzählen',
    cta: 'Weiter',
  },
  handoff: {
    headline: (name: string) => `Ich bin bereit, ${name}.`,
    toneLabel: 'Ton',
    memoriesConfirmed: (n: number) => `${n} Erinnerung${n === 1 ? '' : 'en'} bestätigt`,
    goalsNoted: (n: number) => `${n} Ziel${n === 1 ? '' : 'e'} notiert`,
    cta: 'Leg los',
  },
  error: {
    saveFailed: 'Das hat nicht geklappt — nochmal versuchen?',
    retry: 'Nochmal versuchen',
  },
} as const

// BumFlow's very first chat message after the wizard — written in the chosen tone.
export function firstAssistantMessage(style: CoachingStyle, name: string): string {
  switch (style) {
    case 'Direkt & fordernd':
      return `So, ${name} — genug eingerichtet. Was ist das Eine, das du heute weiterbringen willst?`
    case 'Warm & ermutigend':
      return `Schön, dass du da bist, ${name}. Erzähl mir doch: Was beschäftigt dich heute am meisten?`
    case 'Nur die Fakten':
      return 'Einrichtung abgeschlossen. Was steht heute an?'
    case 'Ausgewogen':
      return `Danke, ${name} — ich bin startklar. Womit fangen wir an?`
  }
}
