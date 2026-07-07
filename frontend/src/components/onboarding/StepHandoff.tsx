import { COPY } from './content'
import type { CoachingStyle } from './content'

export interface StepHandoffProps {
  name: string
  style: CoachingStyle
  confirmedCount: number
  goalsCount: number
  onFinish: () => void
}

export function StepHandoff({ name, style, confirmedCount, goalsCount, onFinish }: StepHandoffProps) {
  const parts = [`${COPY.handoff.toneLabel}: ${style}`]
  if (confirmedCount > 0) parts.push(COPY.handoff.memoriesConfirmed(confirmedCount))
  if (goalsCount > 0) parts.push(COPY.handoff.goalsNoted(goalsCount))
  return (
    <div className="ob-step" data-step="handoff">
      <h1 className="ob-headline stagger-1">{COPY.handoff.headline(name)}</h1>
      <p className="ob-recap stagger-2">{parts.join(' · ')}</p>
      <button className="ob-cta stagger-3" onClick={onFinish}>{COPY.handoff.cta}</button>
    </div>
  )
}
