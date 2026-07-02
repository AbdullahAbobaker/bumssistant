import { useState } from 'react'
import './App.css'
import { ProfileCard } from './components/widgets/ProfileCard'
import { TaskWidget } from './components/widgets/TaskWidget'
import { ProgressWidget } from './components/widgets/ProgressWidget'
import { ChatWidget } from './components/widgets/ChatWidget'
import { WidgetConfig } from './config/widgetRegistry'

type NavItem = 'chat' | 'memory' | 'review' | 'settings'

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

const NAV_ITEMS: { id: NavItem; label: string; Icon: () => JSX.Element }[] = [
  { id: 'chat',     label: 'Chat',     Icon: Icons.Chat },
  { id: 'memory',   label: 'Memory',   Icon: Icons.Brain },
  { id: 'review',   label: 'Review',   Icon: Icons.CheckSquare },
  { id: 'settings', label: 'Settings', Icon: Icons.Settings },
]


function AmbientBackdrop() {
  return <div className="ambient-backdrop" aria-hidden="true" />
}

export default function App() {
  const [activeNav, setActiveNav] = useState<NavItem>('chat')
  const [userDashboardConfig] = useState<WidgetConfig[]>([
    { id: 'tasks', type: 'TASK_LIST', region: 'aside' },
    { id: 'progress', type: 'PROGRESS', region: 'aside' },
    { id: 'profile', type: 'PROFILE', region: 'aside' },
    { id: 'chat', type: 'CHAT', region: 'main' }
  ])

  const renderWidget = (widget: WidgetConfig) => {
    switch (widget.type) {
      case 'PROFILE': return <ProfileCard key={widget.id} />
      case 'TASK_LIST': return <TaskWidget key={widget.id} />
      case 'PROGRESS': return <ProgressWidget key={widget.id} />
      case 'CHAT': return <ChatWidget key={widget.id} />
      default: return null
    }
  }

  const mainWidgets = userDashboardConfig.filter(w => w.region === 'main')
  const asideWidgets = userDashboardConfig.filter(w => w.region === 'aside')

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
                className={`rail-item ${activeNav === id ? 'active' : ''}`}
                onClick={() => setActiveNav(id)}
                aria-label={label}
                aria-current={activeNav === id ? 'page' : undefined}
                title={label}
              >
                <Icon />
                <span>{label}</span>
              </button>
            ))}
          </div>
        </nav>

        {/* ── Main ── */}
        <main className="app-main">
          {/* Top bar */}
          <div className="top-bar glass-1">
            <div className="status-dot" title="Backend verbunden" />
            <span className="top-bar-title">BumFlow</span>
            <span className="top-bar-subtitle">Dein KI-Arbeitsassistent</span>
          </div>

          {/* Main content */}
          {mainWidgets.map(renderWidget)}
        </main>

        {/* ── Right Panel (Widgets) ── */}
        <aside className="right-panel" style={{ width: '320px', padding: '24px', borderLeft: '1px solid var(--glass-border)', display: 'flex', flexDirection: 'column', gap: '24px', overflowY: 'auto', flexShrink: 0 }}>
          {asideWidgets.map(renderWidget)}
        </aside>
      </div>
    </>
  )
}
