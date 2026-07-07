import { useState } from 'react'
import { COPY } from './content'

// Keys match ColdQuestion.key in app/onboarding/questions.py
export interface GoalsAnswers {
  goals: string
  stress_triggers: string
}

export interface StepGoalsProps {
  onSubmit: (answers: GoalsAnswers) => void
}

export function StepGoals({ onSubmit }: StepGoalsProps) {
  const [goals, setGoals] = useState('')
  const [stress, setStress] = useState('')
  return (
    <div className="ob-step" data-step="goals">
      <h1 className="ob-headline stagger-1">{COPY.goals.headline}</h1>
      <label className="ob-label stagger-2">
        {COPY.goals.goalLabel}
        <span className="ob-help">({COPY.goals.goalHelp})</span>
        <textarea
          className="ob-input"
          value={goals}
          onChange={e => setGoals(e.target.value)}
          aria-label={COPY.goals.goalLabel}
        />
      </label>
      <label className="ob-label stagger-3">
        {COPY.goals.stressLabel}
        <span className="ob-help">({COPY.goals.stressHelp})</span>
        <textarea
          className="ob-input"
          value={stress}
          onChange={e => setStress(e.target.value)}
          aria-label={COPY.goals.stressLabel}
        />
      </label>
      <button
        className="ob-skip stagger-4"
        onClick={() => onSubmit({ goals: '', stress_triggers: '' })}
      >
        {COPY.goals.skip}
      </button>
      <button
        className="ob-cta"
        onClick={() => onSubmit({ goals: goals.trim(), stress_triggers: stress.trim() })}
      >
        {COPY.goals.cta}
      </button>
    </div>
  )
}
