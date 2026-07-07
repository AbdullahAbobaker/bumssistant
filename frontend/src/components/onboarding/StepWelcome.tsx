import { COPY } from './content'

export interface StepWelcomeProps {
  name: string
  onNext: () => void
}

export function StepWelcome({ name, onNext }: StepWelcomeProps) {
  return (
    <div className="ob-step" data-step="welcome">
      <h1 className="ob-headline stagger-1">{COPY.welcome.headline(name)}</h1>
      <p className="ob-body stagger-2">{COPY.welcome.body}</p>
      <button className="ob-cta stagger-3" onClick={onNext}>{COPY.welcome.cta}</button>
      <p className="ob-trust stagger-4">{COPY.welcome.trust}</p>
    </div>
  )
}
