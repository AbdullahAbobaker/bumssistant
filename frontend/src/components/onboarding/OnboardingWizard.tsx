import { useEffect, useState, useRef } from 'react'
import './OnboardingWizard.css'
import { COPY, firstAssistantMessage } from './content'
import type { CoachingStyle } from './content'
import { completeOnboarding, fetchReflections, postAnswer, resolveReflection } from './api'
import type { Reflection } from './api'
import { StepWelcome } from './StepWelcome'
import { StepTone } from './StepTone'
import { StepReflections } from './StepReflections'
import { StepGoals } from './StepGoals'
import type { GoalsAnswers } from './StepGoals'
import { StepHandoff } from './StepHandoff'

type StepId = 'welcome' | 'tone' | 'reflections' | 'goals' | 'handoff'

export interface OnboardingWizardProps {
  displayName: string
  onComplete: (welcomeMessage: string) => void
}

export function OnboardingWizard({ displayName, onComplete }: OnboardingWizardProps) {
  const firstName = displayName.split(' ')[0]
  const [step, setStep] = useState<StepId>('welcome')
  const [reflections, setReflections] = useState<Reflection[]>([])
  const [style, setStyle] = useState<CoachingStyle | null>(null)
  const [confirmedCount, setConfirmedCount] = useState(0)
  const [goalsCount, setGoalsCount] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [retry, setRetry] = useState<(() => void) | null>(null)

  const reflectionsRef = useRef<Reflection[]>([])

  useEffect(() => {
    // A failed fetch must never block onboarding — treat it as "nothing noticed".
    fetchReflections()
      .then(refs => {
        reflectionsRef.current = refs
        setReflections(refs)
      })
      .catch(() => {
        reflectionsRef.current = []
        setReflections([])
      })
  }, [])

  const steps: StepId[] = [
    'welcome',
    'tone',
    ...(reflections.length > 0 ? (['reflections'] as const) : []),
    'goals',
    'handoff',
  ]
  const progress = (steps.indexOf(step) + 1) / steps.length
  const goTo = (s: StepId) => { setError(null); setRetry(null); setStep(s) }

  const after = (cur: StepId): StepId => {
    const activeSteps: StepId[] = [
      'welcome',
      'tone',
      ...(reflectionsRef.current.length > 0 ? (['reflections'] as const) : []),
      'goals',
      'handoff',
    ]
    return activeSteps[activeSteps.indexOf(cur) + 1]
  }

  const fail = (retryFn: () => void) => {
    setError(COPY.error.saveFailed)
    setRetry(() => retryFn)
  }

  const submitTone = (s: CoachingStyle) => {
    setError(null)
    postAnswer('coaching_style', s)
      .then(() => { setStyle(s); goTo(after('tone')) })
      .catch(() => fail(() => submitTone(s)))
  }

  const submitGoals = (a: GoalsAnswers) => {
    setError(null)
    const posts: Promise<void>[] = []
    if (a.goals) posts.push(postAnswer('goals', a.goals))
    if (a.stress_triggers) posts.push(postAnswer('stress_triggers', a.stress_triggers))
    Promise.all(posts)
      .then(() => { setGoalsCount(a.goals ? 1 : 0); goTo('handoff') })
      .catch(() => fail(() => submitGoals(a)))
  }

  const finish = () => {
    const chosen = style ?? 'Ausgewogen'
    // Best-effort: a failed completion call must not trap the user in the wizard.
    completeOnboarding()
      .catch(() => {})
      .then(() => onComplete(firstAssistantMessage(chosen, firstName)))
  }

  return (
    <div className="onboarding" data-step={step}>
      <div className="onboarding-tint" aria-hidden="true" />
      <section className="onboarding-card glass-3" aria-label="Einrichtung">
        <div
          className="onboarding-progress"
          style={{ transform: `scaleX(${progress})` }}
          aria-hidden="true"
        />
        {step === 'welcome' && <StepWelcome name={firstName} onNext={() => goTo('tone')} />}
        {step === 'tone' && <StepTone onSubmit={submitTone} />}
        {step === 'reflections' && (
          <StepReflections
            reflections={reflections}
            onResolve={resolveReflection}
            onDone={n => { setConfirmedCount(n); goTo('goals') }}
          />
        )}
        {step === 'goals' && <StepGoals onSubmit={submitGoals} />}
        {step === 'handoff' && style && (
          <StepHandoff
            name={firstName}
            style={style}
            confirmedCount={confirmedCount}
            goalsCount={goalsCount}
            onFinish={finish}
          />
        )}
        {error && (
          <div className="ob-error" role="alert">
            {error}
            {retry && (
              <button className="ob-chip" onClick={retry}>{COPY.error.retry}</button>
            )}
          </div>
        )}
      </section>
    </div>
  )
}
