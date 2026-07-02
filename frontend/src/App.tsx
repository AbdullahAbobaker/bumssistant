import './App.css'

function App() {
  return (
    <div className="dashboard-layout">
      <aside className="dashboard-sidebar glass-dark">
        <h2 className="text-heading-medium">BumFlow</h2>
        <div className="sidebar-section">
          <h3>Aktive Projekte</h3>
          <ul>
            <li>Projekt Alpha</li>
          </ul>
        </div>
        <div className="sidebar-section">
          <h3>Heute fällig</h3>
          <ul>
            <li>Design Review</li>
          </ul>
        </div>
      </aside>
      <header className="dashboard-header glass">
        <h1 className="text-heading-large">Dashboard</h1>
        <button className="btn">Neues Projekt</button>
      </header>
      <main className="dashboard-main">
        <div className="dashboard-widgets">
          <div className="widget glass">
            <h3 className="text-heading-medium">Chat</h3>
            <div className="chat-thread">
              <p className="greeting">Wie kann ich dir helfen?</p>
            </div>
            <div className="chat-input-wrapper glass-dark">
              <input type="text" placeholder="Nachricht an BumFlow..." aria-label="Nachricht an BumFlow" className="chat-input" />
              <button className="btn">Senden</button>
            </div>
          </div>
          <div className="widget glass-dark">
            <h3>Performance</h3>
          </div>
        </div>
      </main>
    </div>
  )
}

export default App
