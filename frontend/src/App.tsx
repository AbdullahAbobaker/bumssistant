import './App.css'

function App() {
  return (
    <div className="layout">
      <aside className="sidebar glass">
        <h2>BumFlow</h2>
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
      <main className="chat-area">
        <div className="chat-thread">
          <p className="greeting">Wie kann ich dir helfen?</p>
        </div>
        <div className="chat-input-wrapper glass">
          <input type="text" placeholder="Nachricht an BumFlow..." className="chat-input" />
          <button className="btn">Senden</button>
        </div>
      </main>
    </div>
  )
}

export default App
