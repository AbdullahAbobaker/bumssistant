import './DynamicStatWidget.css'

export interface DynamicStatWidgetProps {
  title: string;
  value: string | number;
  color?: string;
}

export function DynamicStatWidget({ title, value, color }: DynamicStatWidgetProps) {
  const style = color ? { '--stat-accent': color } as React.CSSProperties : {};
  return (
    <div className="widget glass dynamic-stat-widget" style={style}>
      <h3 className="text-label stat-title">{title}</h3>
      <div className="stat-value text-heading-large">{value}</div>
    </div>
  )
}
