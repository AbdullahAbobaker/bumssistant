import './App.css'
import { TopNav } from './components/TopNav'
import { WelcomeHeader } from './components/WelcomeHeader'

function App() {
  return (
    <div className="dashboard-layout">
      <TopNav />
      <main className="dashboard-main">
        <WelcomeHeader user="Abdullah" />
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
