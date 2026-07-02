import './TopNav.css';

interface TopNavProps {
  onOpenSettings?: () => void;
}

export function TopNav({ onOpenSettings }: TopNavProps) {
  return (
    <nav className="top-nav glass">
      <div className="top-nav-logo">
        <span className="text-heading-medium" style={{ margin: 0, fontWeight: 500 }}>BumFlow</span>
      </div>
      <ul className="top-nav-links">
        <li>
          <a href="#" className="nav-link active glass-dark">Dashboard</a>
        </li>
        <li>
          <a href="#" className="nav-link">Projekte</a>
        </li>
        <li>
          <a href="#" className="nav-link">Team</a>
        </li>
        <li>
          <a href="#" className="nav-link">Kalender</a>
        </li>
        <li>
          <a href="#" className="nav-link">Einstellungen</a>
        </li>
      </ul>
      {onOpenSettings && (
        <button 
          className="btn-edit-dashboard glass-2" 
          onClick={onOpenSettings}
        >
          Dashboard bearbeiten
        </button>
      )}
    </nav>
  );
}
