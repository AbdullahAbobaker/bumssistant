import { useState, useRef, useEffect, useCallback, KeyboardEvent } from 'react'
import './App.css'
import { ProfileCard } from './components/widgets/ProfileCard'
import { TaskWidget } from './components/widgets/TaskWidget'
import { ProgressWidget } from './components/widgets/ProgressWidget'

// ── Types ────────────────────────────────────────────
interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
}

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
  Send: () => (
    <svg viewBox="0 0 24 24"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
  ),
  Sparkles: () => (
    <svg viewBox="0 0 24 24"><path d="M12 3L13.5 8.5L19 10L13.5 11.5L12 17L10.5 11.5L5 10L10.5 8.5L12 3Z"/><path d="M5 3L5.75 5.25L8 6L5.75 6.75L5 9L4.25 6.75L2 6L4.25 5.25L5 3Z"/><path d="M19 14L19.75 16.25L22 17L19.75 17.75L19 20L18.25 17.75L16 17L18.25 16.25L19 14Z"/></svg>
  ),
}

// ── API ──────────────────────────────────────────────
async function postChat(message: string): Promise<string> {
  const res = await fetch('/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error((err as { detail?: string }).detail ?? `HTTP ${res.status}`)
  }
  const data = await res.json() as { reply: string }
  return data.reply
}

// ── Helpers ──────────────────────────────────────────
function formatTime(date: Date): string {
  return date.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
}

function uid(): string {
  return Math.random().toString(36).slice(2, 10)
}

const SUGGESTIONS = [
  'Was steht heute an?',
  'Zeig meine offenen Aufgaben',
  'Wie läuft das Projekt?',
  'Ich bin gerade blockiert',
]

const NAV_ITEMS: { id: NavItem; label: string; Icon: () => JSX.Element }[] = [
  { id: 'chat',     label: 'Chat',     Icon: Icons.Chat },
  { id: 'memory',   label: 'Memory',   Icon: Icons.Brain },
  { id: 'review',   label: 'Review',   Icon: Icons.CheckSquare },
  { id: 'settings', label: 'Settings', Icon: Icons.Settings },
]

// ── Components ───────────────────────────────────────

function AmbientBackdrop() {
  return <div className="ambient-backdrop" aria-hidden="true" />
}

function TypingIndicator() {
  return (
    <div className="typing-indicator">
      <div className="message-avatar" style={{ width: 32, height: 32, borderRadius: 10, background: 'linear-gradient(135deg, rgba(129,140,248,0.3), rgba(99,102,241,0.2))', border: '1px solid rgba(129,140,248,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, color: 'var(--accent)', flexShrink: 0, marginTop: 2 }}>
        BF
      </div>
      <div className="typing-dots">
        <span className="typing-dot" />
        <span className="typing-dot" />
        <span className="typing-dot" />
      </div>
    </div>
  )
}

interface MessageBubbleProps { msg: Message }
function MessageBubble({ msg }: MessageBubbleProps) {
  return (
    <div className={`message ${msg.role}`}>
      <div className="message-avatar">
        {msg.role === 'assistant' ? 'BF' : 'Du'}
      </div>
      <div>
        <div className="message-bubble">{msg.content}</div>
        <div className="message-time">{formatTime(msg.timestamp)}</div>
      </div>
    </div>
  )
}

// ── Main App ─────────────────────────────────────────
export default function App() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput]       = useState('')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState<string | null>(null)
  const [activeNav, setActiveNav] = useState<NavItem>('chat')

  const threadRef  = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    const el = threadRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages, loading])

  // Auto-resize textarea
  useEffect(() => {
    const ta = textareaRef.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = `${Math.min(ta.scrollHeight, 140)}px`
  }, [input])

  const sendMessage = useCallback(async (text: string) => {
    const trimmed = text.trim()
    if (!trimmed || loading) return

    setError(null)
    setInput('')

    const userMsg: Message = {
      id: uid(), role: 'user', content: trimmed, timestamp: new Date(),
    }
    setMessages(prev => [...prev, userMsg])
    setLoading(true)

    try {
      const reply = await postChat(trimmed)
      const assistantMsg: Message = {
        id: uid(), role: 'assistant', content: reply, timestamp: new Date(),
      }
      setMessages(prev => [...prev, assistantMsg])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Verbindungsfehler')
    } finally {
      setLoading(false)
      setTimeout(() => textareaRef.current?.focus(), 0)
    }
  }, [loading])

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage(input)
    }
  }

  const isEmpty = messages.length === 0 && !loading

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

          {/* Chat surface */}
          <section className="chat-surface" aria-label="Chat mit BumFlow">
            <div className="chat-thread" ref={threadRef} role="log" aria-live="polite" aria-label="Gesprächsverlauf">
              {isEmpty ? (
                <div className="chat-empty">
                  <div className="chat-empty-icon">
                    <Icons.Sparkles />
                  </div>
                  <h2>Guten Tag!</h2>
                  <p>Ich bin BumFlow — dein direkter, warmer Anti-Prokrastinations-Coach. Was liegt an?</p>
                  <div className="suggestion-pills">
                    {SUGGESTIONS.map(s => (
                      <button
                        key={s}
                        className="suggestion-pill"
                        onClick={() => sendMessage(s)}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <>
                  {messages.map(msg => (
                    <MessageBubble key={msg.id} msg={msg} />
                  ))}
                  {loading && <TypingIndicator />}
                </>
              )}
            </div>

            {error && <div className="error-toast" role="alert">{error}</div>}

            {/* Composer */}
            <div className="composer" role="form" aria-label="Nachricht eingeben">
              <textarea
                ref={textareaRef}
                id="chat-input"
                className="composer-input"
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Nachricht an BumFlow… (Enter zum Senden, Shift+Enter für Umbruch)"
                aria-label="Nachricht"
                rows={1}
                disabled={loading}
              />
              <button
                id="chat-send"
                className="composer-send"
                onClick={() => sendMessage(input)}
                disabled={!input.trim() || loading}
                aria-label="Senden"
              >
                <Icons.Send />
              </button>
            </div>
          </section>
        </main>

        {/* ── Right Panel (Widgets) ── */}
        <aside className="right-panel" style={{ width: '320px', padding: '24px', borderLeft: '1px solid var(--glass-border)', display: 'flex', flexDirection: 'column', gap: '24px', overflowY: 'auto', flexShrink: 0 }}>
          <ProfileCard />
          <TaskWidget />
          <ProgressWidget />
        </aside>
      </div>
    </>
  )
}
