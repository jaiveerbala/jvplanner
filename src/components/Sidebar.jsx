import { useAuth } from '../lib/AuthContext'

const TAB_CONFIG = [
  { id: 'home',       label: 'Home',      color: '#e2e8f0' },
  { id: 'everything', label: 'Everything',color: '#2dd4b0' },
  { id: 'general',    label: 'General',   color: '#60a5fa' },
  { id: 'school',     label: 'School',    color: '#c084fc' },
  { id: 'college',    label: 'College',   color: '#f59e0b' },
  { id: 'completed',  label: 'Completed', color: '#4ade80' },
]

export default function Sidebar({ currentTab, onNavigate }) {
  const { user, signOut } = useAuth()

  return (
    <nav className="sidebar">
      <div className="sidebar-brand">
        <span className="sidebar-brand-dot" />
        <span className="sidebar-brand-name">JVPLANNER</span>
      </div>

      {TAB_CONFIG.map(({ id, label, color }, i) => (
        <div key={id}>
          {i === 1 && <div className="nav-divider" />}
          {i === 5 && <div className="nav-divider" />}
          <button
            className={`nav-item${currentTab === id ? ' active' : ''}`}
            onClick={() => onNavigate(id)}
          >
            <span className="nav-item-dot" style={{ background: color }} />
            {label}
          </button>
        </div>
      ))}

      <div className="sidebar-bottom">
        <button className="nav-item" onClick={signOut} style={{ fontSize: 11, color: 'var(--t-3)' }}>
          Sign out
          <span style={{ fontSize: 10, marginLeft: 'auto', color: 'var(--t-4)' }}>
            {user?.email?.split('@')[0]}
          </span>
        </button>
      </div>
    </nav>
  )
}
