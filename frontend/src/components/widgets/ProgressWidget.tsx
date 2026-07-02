import './ProgressWidget.css'

export function ProgressWidget() {
  const progress = 78

  return (
    <div className="widget glass progress-widget">
      <h3 className="text-heading-medium">Fortschritt</h3>
      <div className="progress-content">
        <div className="progress-bar-container">
          <div className="progress-bar-track">
            <div 
              className="progress-bar-fill" 
              style={{ width: `${progress}%` }}
              role="progressbar"
              aria-valuenow={progress}
              aria-valuemin={0}
              aria-valuemax={100}
            />
          </div>
          <div className="progress-stats">
            <span className="progress-percentage">{progress}%</span>
            <span className="progress-label">Abgeschlossen</span>
          </div>
        </div>
      </div>
    </div>
  )
}
