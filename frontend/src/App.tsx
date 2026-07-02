import { useState } from 'react'
import type { JSX } from 'react'
import './App.css'
import { ProfileCard } from './components/widgets/ProfileCard'
import { TaskWidget } from './components/widgets/TaskWidget'
import { ProgressWidget } from './components/widgets/ProgressWidget'
import { ChatWidget } from './components/widgets/ChatWidget'
import { DynamicStatWidget } from './components/widgets/DynamicStatWidget'
import { DynamicListWidget } from './components/widgets/DynamicListWidget'
import { CalendarWidget } from './components/widgets/CalendarWidget'
import type { WidgetConfig } from './config/widgetRegistry'
import { TopNav } from './components/TopNav'
import { DashboardSettingsModal } from './components/DashboardSettingsModal'
import { WIDGET_DEFAULT_SIZES } from './config/widgetRegistry'

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
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [userDashboardConfig, setUserDashboardConfig] = useState<WidgetConfig[]>([
    { id: 'stat1', type: 'STAT_CARD', region: 'aside', props: { title: 'Urlaubsanspruch', value: '28 Tage', color: '#818CF8' } },
    { id: 'calendar', type: 'CALENDAR', region: 'aside' },
    { id: 'tasks', type: 'TASK_LIST', region: 'aside', props: { tasks: [{ id: 1, title: 'Interview', completed: false }, { id: 2, title: 'Team-Meeting', completed: true }] } },
    { id: 'team', type: 'ACCORDION_LIST', region: 'aside', props: { title: 'Teammitglieder', items: [{ label: 'Max Mustermann', content: 'Developer' }, { label: 'Erika Musterfrau', content: 'Designer' }] } },
    { id: 'progress', type: 'PROGRESS', region: 'aside' },
    { id: 'profile', type: 'PROFILE', region: 'aside' },
    { id: 'chat', type: 'CHAT', region: 'main' }
  ])

  const renderWidget = (widget: WidgetConfig) => {
    switch (widget.type) {
      case 'PROFILE': return <ProfileCard key={widget.id} {...widget.props} />
      case 'TASK_LIST': return <TaskWidget key={widget.id} {...widget.props} />
      case 'PROGRESS': return <ProgressWidget key={widget.id} {...widget.props} />
      case 'CHAT': return <ChatWidget key={widget.id} {...widget.props} />
      case 'STAT_CARD': return <DynamicStatWidget key={widget.id} {...widget.props} />
      case 'ACCORDION_LIST': return <DynamicListWidget key={widget.id} {...widget.props} />
      case 'CALENDAR': return <CalendarWidget key={widget.id} {...widget.props} />
      default: return null
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

        {/* ── Main Dashboard ── */}
        <main className="app-main">
          {/* Top Nav */}
          <div style={{ padding: '24px 24px 0', flexShrink: 0 }}>
            <TopNav onOpenSettings={() => setIsSettingsOpen(true)} />
          </div>

          {/* Grid content */}
          <div className="dashboard-grid">
            {userDashboardConfig.map((widget) => {
              const w = widget.w ?? WIDGET_DEFAULT_SIZES[widget.type].w;
              const h = widget.h ?? WIDGET_DEFAULT_SIZES[widget.type].h;
              const className = `widget-wrapper col-span-${w} row-span-${h}`;
              return (
                <div key={widget.id} className={className}>
                  {renderWidget(widget)}
                </div>
              );
            })}
          </div>
        </main>
      </div>

      {isSettingsOpen && (
        <DashboardSettingsModal 
          userDashboardConfig={userDashboardConfig}
          onSave={(newConfig) => {
            setUserDashboardConfig(newConfig);
            setIsSettingsOpen(false);
          }}
          onClose={() => setIsSettingsOpen(false)}
        />
      )}
    </>
  )
}
