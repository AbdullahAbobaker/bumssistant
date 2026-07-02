// frontend/src/components/ChatView.tsx
import './ChatView.css'
import { ChatWidget } from './widgets/ChatWidget'
import { ProfileCard } from './widgets/ProfileCard'
import { TaskWidget } from './widgets/TaskWidget'
import { ProposedMemoriesTeaser } from './widgets/ProposedMemoriesTeaser'

export function germanGreeting(hour: number): string {
  if (hour >= 5 && hour < 12) return 'Guten Morgen'
  if (hour >= 12 && hour < 18) return 'Guten Tag'
  if (hour >= 18 && hour < 23) return 'Guten Abend'
  return 'Gute Nacht'
}

export interface ChatViewProps {
  onReviewClick: () => void
}

export function ChatView({ onReviewClick }: ChatViewProps) {
  const greeting = germanGreeting(new Date().getHours())
  return (
    <div className="chat-view">
      <div className="chat-view-hero">
        <ChatWidget />
      </div>
      <aside className="chat-view-sidebar" aria-label="Übersicht">
        <h2 className="chat-view-greeting">{greeting}</h2>
        <ProfileCard />
        <TaskWidget />
        <ProposedMemoriesTeaser count={2} onReview={onReviewClick} />
      </aside>
    </div>
  )
}
