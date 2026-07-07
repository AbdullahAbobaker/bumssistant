// frontend/src/components/ChatView.tsx
import { useEffect, useState } from 'react'
import './ChatView.css'
import { listProposedMemories } from '../api'
import { ChatWidget } from './widgets/ChatWidget'
import { ProfileCard } from './widgets/ProfileCard'
import { TaskWidget } from './widgets/TaskWidget'
import { ProposedMemoriesTeaser } from './widgets/ProposedMemoriesTeaser'

import { germanGreeting } from '../utils/greeting'
export interface ChatViewProps {
  onReviewClick: () => void
  welcomeMessage?: string
}

export function ChatView({ onReviewClick, welcomeMessage }: ChatViewProps) {
  const greeting = germanGreeting(new Date().getHours())
  const [proposedCount, setProposedCount] = useState(0)

  useEffect(() => {
    let cancelled = false
    listProposedMemories()
      .then(ms => { if (!cancelled) setProposedCount(ms.length) })
      .catch(() => { /* teaser simply stays hidden */ })
    return () => { cancelled = true }
  }, [])

  return (
    <div className="chat-view">
      <div className="chat-view-hero">
        <ChatWidget initialAssistantMessage={welcomeMessage} />
      </div>
      <aside className="chat-view-sidebar" aria-label="Übersicht">
        <h2 className="chat-view-greeting">{greeting}</h2>
        <ProfileCard />
        <TaskWidget />
        {proposedCount > 0 && (
          <ProposedMemoriesTeaser count={proposedCount} onReview={onReviewClick} />
        )}
      </aside>
    </div>
  )
}
