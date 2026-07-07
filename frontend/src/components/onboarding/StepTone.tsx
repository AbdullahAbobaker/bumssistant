import { useState } from 'react'
import { COACHING_STYLES, COPY } from './content'
import type { CoachingStyle } from './content'
import { TonePreview } from './TonePreview'

export interface StepToneProps {
  onSubmit: (style: CoachingStyle) => void
}

export function StepTone({ onSubmit }: StepToneProps) {
  const [selected, setSelected] = useState<CoachingStyle | null>(null)
  return (
    <div className="ob-step" data-step="tone">
      <h1 className="ob-headline stagger-1">{COPY.tone.headline}</h1>
      {selected
        ? <TonePreview style={selected} />
        : <div className="tone-preview-placeholder" aria-hidden="true" />}
      <div className="tone-grid" role="radiogroup" aria-label={COPY.tone.headline}>
        {COACHING_STYLES.map((s, i) => (
          <button
            key={s}
            role="radio"
            aria-checked={selected === s}
            className={`tone-card stagger-${i + 2} ${selected === s ? 'selected' : ''}`}
            onClick={() => setSelected(s)}
          >
            {s}
          </button>
        ))}
      </div>
      <p className="ob-footnote">{COPY.tone.footer}</p>
      <button
        className="ob-cta"
        disabled={!selected}
        onClick={() => selected && onSubmit(selected)}
      >
        {COPY.tone.cta}
      </button>
    </div>
  )
}
