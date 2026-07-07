import { useState } from 'react'
import type { JSX } from 'react'
import './App.css'
import { ChatView } from './components/ChatView'
import { EmptyState } from './components/EmptyState'

type View = 'chat' | 'memory' | 'review' | 'settings'

// ── Icons (inline SVG, Lucide-style) ────────────────
const Icons = {
  Chat: () => (
    <svg viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
  ),
  Brain: () => (
    <svg viewBox="0 0 24 24"><path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96-.44 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 4.44-1.66Z"/><path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96-.44 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-4.44-1.66Z"/></svg>
  ),
  CheckSquare: () => (
    <svg viewBox="0 0 24 24"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
  ),
  Settings: () => (
    <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
  ),
}

const NAV_ITEMS: { id: View; label: string; Icon: () => JSX.Element }[] = [
  { id: 'chat',     label: 'Chat',     Icon: Icons.Chat },
  { id: 'memory',   label: 'Memory',   Icon: Icons.Brain },
  { id: 'review',   label: 'Review',   Icon: Icons.CheckSquare },
  { id: 'settings', label: 'Settings', Icon: Icons.Settings },
]

function AmbientBackdrop() {
  return <div className="ambient-backdrop" aria-hidden="true" />
}

export default function App() {
  const [view, setView] = useState<View>('chat')

  const renderView = () => {
    switch (view) {
      case 'memory':   return <EmptyState title="Memory" />
      case 'review':   return <EmptyState title="Review" />
      case 'settings': return <EmptyState title="Settings" />
      case 'chat':
      default:         return <ChatView onReviewClick={() => setView('review')} />
    }
  }

  return (
    <>
      <AmbientBackdrop />

      <div className="app-shell">
        {/* ── Left Rail ── */}
        <nav className="rail glass-1" aria-label="Hauptnavigation">
          <div className="rail-logo" aria-label="BumFlow">BF</div>
          <div className="rail-nav">
            {NAV_ITEMS.map(({ id, label, Icon }) => (
              <button
                key={id}
                id={`nav-${id}`}
                className={`rail-item ${view === id ? 'active' : ''}`}
                onClick={() => setView(id)}
                aria-label={label}
                aria-current={view === id ? 'page' : undefined}
                title={label}
              >
                <Icon />
                <span>{label}</span>
              </button>
            ))}
          </div>
        </nav>

        {/* ── Main content ── */}
        <main className="app-main">
          {renderView()}
        </main>
      </div>
    </>
  )
}
