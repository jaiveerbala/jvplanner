const TAB_CONFIG = [
  { id: 'home',      label: 'Home',   color: '#e2e8f0' },
  { id: 'everything',label: 'All',    color: '#2dd4b0' },
  { id: 'general',   label: 'General',color: '#60a5fa' },
  { id: 'school',    label: 'School', color: '#c084fc' },
  { id: 'college',   label: 'College',color: '#f59e0b' },
  { id: 'tracks',    label: 'Tracks', color: '#fbbf24' },
  { id: 'plan',      label: 'Plan',   color: '#34d399' },
  { id: 'completed', label: 'Done',   color: '#4ade80' },
]

export default function MobileNav({ currentTab, onNavigate }) {
  return (
    <div className="mobile-nav">
      <div className="mobile-nav-inner">
        {TAB_CONFIG.map(({ id, label, color }) => (
          <button
            key={id}
            className={`mobile-nav-item${currentTab === id ? ' active' : ''}`}
            onClick={() => onNavigate(id)}
          >
            <span className="mobile-nav-dot" style={{ background: currentTab === id ? color : 'var(--t-4)' }} />
            {label}
          </button>
        ))}
      </div>
    </div>
  )
}