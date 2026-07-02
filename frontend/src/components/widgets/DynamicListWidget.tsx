import './DynamicListWidget.css'

export interface DynamicListItem {
  label: string;
  content: string;
}

export interface DynamicListWidgetProps {
  title?: string;
  items: DynamicListItem[];
}

export function DynamicListWidget({ title, items }: DynamicListWidgetProps) {
  return (
    <div className="widget glass dynamic-list-widget">
      {title && <h3 className="text-heading-medium list-title">{title}</h3>}
      <div className="accordion-list">
        {items.map((item) => (
          <details key={item.label} className="accordion-item glass-1">
            <summary className="accordion-summary text-body">
              {item.label}
              <span className="accordion-icon" aria-hidden="true">▼</span>
            </summary>
            <div className="accordion-content text-small text-muted">
              {item.content}
            </div>
          </details>
        ))}
      </div>
    </div>
  )
}
