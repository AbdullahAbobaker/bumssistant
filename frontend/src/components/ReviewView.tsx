import { useEffect, useState } from 'react'
import './ReviewView.css'
import { confirmMemory, listProposedMemories, rejectMemory } from '../api'
import type { ProposedMemory } from '../api'

const TYPE_LABELS: Record<string, string> = {
  task: 'Aufgabe',
  blocker: 'Blocker',
  decision: 'Entscheidung',
  pattern: 'Muster',
  comm_style: 'Kommunikationsstil',
}

export function ReviewView() {
  const [memories, setMemories] = useState<ProposedMemory[]>([])
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    listProposedMemories()
      .then(ms => { if (!cancelled) { setMemories(ms); setLoaded(true) } })
      .catch(e => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Verbindungsfehler')
          setLoaded(true)
        }
      })
    return () => { cancelled = true }
  }, [])

  const decide = async (id: string, verdict: 'confirm' | 'reject') => {
    setMemories(prev => prev.filter(m => m.id !== id)) // optimistic
    try {
      await (verdict === 'confirm' ? confirmMemory(id) : rejectMemory(id))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Verbindungsfehler')
    }
  }

  return (
    <section className="review-view" aria-label="Vorgeschlagene Erinnerungen">
      <h1 className="review-title">Review</h1>
      <p className="review-subtitle">Was BumFlow gelernt zu haben glaubt — du entscheidest.</p>
      {error && <div className="error-toast" role="alert">{error}</div>}
      {loaded && memories.length === 0 ? (
        <div className="review-empty glass-2">
          <h2>Alles erledigt</h2>
          <p>Keine Vorschläge zur Bestätigung.</p>
        </div>
      ) : (
        <ul className="review-list">
          {memories.map(m => (
            <li key={m.id} className="review-card glass-2">
              <div className="review-card-head">
                <span className="review-type">{TYPE_LABELS[m.type] ?? m.type}</span>
                <span className="review-confidence">{Math.round(m.confidence * 100)} % sicher</span>
              </div>
              <h3 className="review-card-title">{m.title}</h3>
              {m.note && <p className="review-card-note">{m.note}</p>}
              <div className="review-card-actions">
                <button className="review-confirm" onClick={() => decide(m.id, 'confirm')}>
                  Bestätigen
                </button>
                <button className="review-reject" onClick={() => decide(m.id, 'reject')}>
                  Ablehnen
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
