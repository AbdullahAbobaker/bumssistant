import { useState } from 'react'
import { COPY } from './content'
import type { Reflection } from './api'

export interface StepReflectionsProps {
  reflections: Reflection[]
  onResolve: (id: string, action: 'confirm' | 'dismiss', text?: string) => Promise<void>
  onDone: (confirmedCount: number) => void
}

type Resolution = 'confirmed' | 'dismissed'

export function StepReflections({ reflections, onResolve, onDone }: StepReflectionsProps) {
  const [resolved, setResolved] = useState<Record<string, Resolution>>({})
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [error, setError] = useState<string | null>(null)

  const resolve = async (id: string, action: 'confirm' | 'dismiss', text?: string) => {
    setError(null)
    try {
      await onResolve(id, action, text)
      setResolved(prev => ({ ...prev, [id]: action === 'confirm' ? 'confirmed' : 'dismissed' }))
      setEditing(null)
    } catch {
      setError(COPY.error.saveFailed)
    }
  }

  const confirmedCount = Object.values(resolved).filter(v => v === 'confirmed').length

  return (
    <div className="ob-step" data-step="reflections">
      <h1 className="ob-headline stagger-1">{COPY.reflections.headline}</h1>
      <p className="ob-body stagger-2">{COPY.reflections.subline}</p>
      <ul className="reflection-stack">
        {reflections.map(r => {
          const state = resolved[r.id]
          return (
            <li key={r.id} className={`reflection-card glass-2 ${state ?? ''}`}>
              {editing === r.id ? (
                <>
                  <textarea
                    className="reflection-edit"
                    value={draft}
                    aria-label={COPY.reflections.editLabel}
                    onChange={e => setDraft(e.target.value)}
                  />
                  <div className="reflection-actions">
                    <button className="ob-chip" onClick={() => resolve(r.id, 'confirm', draft)}>
                      {COPY.reflections.save}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <p className="reflection-text">{r.text}</p>
                  {!state && (
                    <div className="reflection-actions">
                      <button className="ob-chip" onClick={() => resolve(r.id, 'confirm', undefined)}>
                        {COPY.reflections.confirm}
                      </button>
                      <button className="ob-chip" onClick={() => { setEditing(r.id); setDraft(r.text) }}>
                        {COPY.reflections.edit}
                      </button>
                      <button className="ob-chip danger" onClick={() => resolve(r.id, 'dismiss', undefined)}>
                        {COPY.reflections.dismiss}
                      </button>
                    </div>
                  )}
                </>
              )}
            </li>
          )
        })}
      </ul>
      {error && <div className="ob-error" role="alert">{error}</div>}
      <button className="ob-cta" onClick={() => onDone(confirmedCount)}>{COPY.reflections.cta}</button>
    </div>
  )
}
