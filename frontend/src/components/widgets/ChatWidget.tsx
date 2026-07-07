import { useState, useRef, useEffect, useCallback } from 'react'
import type { KeyboardEvent } from 'react'
import { getHistory } from '../../api'
import '../../App.css'

// ── Types ────────────────────────────────────────────
interface Message {
  id: string
  role: 'user' | 'assistant' | 'briefing'
  content: string
  timestamp: Date
}

// ── Icons (inline SVG, Lucide-style) ────────────────
const Icons = {
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

// ── Components ───────────────────────────────────────
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
  const side = msg.role === 'user' ? 'user' : 'assistant'
  const extra = msg.role === 'briefing' ? ' briefing' : ''
  return (
    <div className={`message ${side}${extra}`}>
      <div className="message-avatar">
        {msg.role === 'user' ? 'Du' : 'BF'}
      </div>
      <div>
        <div className="message-bubble">{msg.content}</div>
        <div className="message-time">{formatTime(msg.timestamp)}</div>
      </div>
    </div>
  )
}

export interface ChatWidgetProps {
  /** Set by the onboarding handoff: BumFlow's first message, pre-typed in the chosen tone. */
  initialAssistantMessage?: string
}

export function ChatWidget({ initialAssistantMessage }: ChatWidgetProps = {}) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput]       = useState('')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState<string | null>(null)

  const threadRef  = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Hydrate the persistent thread (Decision #17) — a reload must not lose it.
  useEffect(() => {
    if (initialAssistantMessage) return
    let cancelled = false
    getHistory()
      .then(hist => {
        if (cancelled || hist.length === 0) return
        setMessages(hist.map(h => ({
          id: uid(),
          role: h.role,
          content: h.content,
          timestamp: new Date(h.created_at),
        })))
      })
      .catch(() => { /* fresh thread if history is unavailable */ })
    return () => { cancelled = true }
  }, [initialAssistantMessage])

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

  // Onboarding handoff: BumFlow is "already typing" when the chat first appears.
  useEffect(() => {
    if (!initialAssistantMessage) return
    setLoading(true)
    const t = setTimeout(() => {
      setMessages([{
        id: uid(), role: 'assistant', content: initialAssistantMessage, timestamp: new Date(),
      }])
      setLoading(false)
    }, 900)
    return () => clearTimeout(t)
  }, [initialAssistantMessage])

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
    <section className="chat-surface glass" aria-label="Chat mit BumFlow" style={{ borderRadius: 'var(--radius-lg)' }}>
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
  )
}
