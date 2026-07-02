import './EmptyState.css'

export interface EmptyStateProps {
  title: string
  hint?: string
}

export function EmptyState({ title, hint = 'Kommt bald…' }: EmptyStateProps) {
  return (
    <div className="empty-state glass-2">
      <h2>{title}</h2>
      <p>{hint}</p>
    </div>
  )
}
