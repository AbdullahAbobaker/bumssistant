import './TaskWidget.css'

export interface TaskItem {
  id: number;
  title: string;
  completed: boolean;
}

export interface TaskWidgetProps {
  tasks?: TaskItem[];
}

export function TaskWidget({ tasks: propsTasks }: TaskWidgetProps) {
  const tasks = propsTasks || [
    { id: 1, title: 'Interview', completed: false },
    { id: 2, title: 'Team-Meeting', completed: false },
    { id: 3, title: 'Projekt Update', completed: true },
  ]

  return (
    <div className="widget glass-dark task-widget-card">
      <h3 className="text-heading-medium">Aufgaben</h3>
      <ul className="task-list">
        {tasks.map(task => (
          <li key={task.id} className={`task-item ${task.completed ? 'completed' : ''}`}>
            <input
              type="checkbox"
              className="task-checkbox-input"
              checked={task.completed}
              readOnly
              aria-label={`${task.title} Status`}
            />
            <span className="task-title">{task.title}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
