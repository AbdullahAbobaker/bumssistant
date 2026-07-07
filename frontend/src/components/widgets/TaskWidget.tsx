import { useCallback, useEffect, useState } from 'react'
import './TaskWidget.css'
import { completeTask, listTasks } from '../../api'
import type { Task } from '../../api'

export function TaskWidget() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [loaded, setLoaded] = useState(false)

  const refresh = useCallback(() => {
    listTasks()
      .then(ts => { setTasks(ts); setLoaded(true) })
      .catch(() => setLoaded(true))
  }, [])

  useEffect(() => { refresh() }, [refresh])

  const onComplete = async (id: string) => {
    setTasks(prev => prev.filter(t => t.id !== id)) // optimistic
    try { await completeTask(id) } finally { refresh() }
  }

  return (
    <div className="widget glass-dark task-widget-card">
      <h3 className="text-heading-medium">Aufgaben</h3>
      {loaded && tasks.length === 0 ? (
        <p className="task-empty">Keine offenen Aufgaben.</p>
      ) : (
        <ul className="task-list">
          {tasks.map(task => (
            <li key={task.id} className={`task-item ${task.overdue ? 'overdue' : ''}`}>
              <input
                type="checkbox"
                className="task-checkbox-input"
                checked={false}
                onChange={() => onComplete(task.id)}
                aria-label={`${task.title} erledigen`}
              />
              <span className="task-title">{task.title}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
