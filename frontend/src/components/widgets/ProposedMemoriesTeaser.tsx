import './ProposedMemoriesTeaser.css'

export interface ProposedMemoriesTeaserProps {
  count: number
  onReview: () => void
}

export function ProposedMemoriesTeaser({ count, onReview }: ProposedMemoriesTeaserProps) {
  return (
    <button className="memories-teaser glass-2" onClick={onReview}>
      <span className="memories-teaser-count">{count}</span>
      <span className="memories-teaser-label">{count} Vorschläge zur Bestätigung</span>
    </button>
  )
}
