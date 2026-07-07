import './TonePreview.css'
import type { CoachingStyle } from './content'
import { TONE_PREVIEWS } from './content'

export interface TonePreviewProps {
  style: CoachingStyle
}

// Live preview bubble: the same BumFlow message re-rendered in the selected
// tone. key={style} remounts the <p> so the word-by-word entrance replays.
export function TonePreview({ style }: TonePreviewProps) {
  const text = TONE_PREVIEWS[style]
  return (
    <div className="tone-preview glass-2" role="status" aria-label="Vorschau">
      <div className="tone-preview-avatar" aria-hidden="true">BF</div>
      <p key={style} className="tone-preview-text">
        {text.split(' ').map((word, i) => (
          <span key={i} className="tone-preview-word" style={{ animationDelay: `${i * 30}ms` }}>
            {word}{' '}
          </span>
        ))}
      </p>
    </div>
  )
}
