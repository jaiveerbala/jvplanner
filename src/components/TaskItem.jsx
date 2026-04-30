import { format, parseISO } from 'date-fns'

const TAB_COLORS = {
  general: '#60a5fa',
  school:  '#c084fc',
  college: '#f59e0b',
}

export default function TaskItem({ event, onToggle, onDelete, showTab, showDate }) {
  const color = TAB_COLORS[event.tab] || 'var(--t-3)'

  return (
    <div className={`task-item${event.completed ? ' done' : ''}`}>
      <div
        className={`task-checkbox${event.completed ? ' checked' : ''}`}
        onClick={() => onToggle(event)}
      />
      <div className="task-color-bar" style={{ background: color }} />
      <div className="task-body">
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div className="task-title">{event.title}</div>
          {event.is_meeting && (
            <span style={{
              fontSize: 9,
              padding: '1px 6px',
              borderRadius: 99,
              background: 'rgba(96,165,250,0.12)',
              color: '#60a5fa',
              border: '1px solid rgba(96,165,250,0.2)',
              fontFamily: 'var(--f-mono)',
              letterSpacing: '0.06em',
              flexShrink: 0,
            }}>
              MEETING
            </span>
          )}
        </div>
        <div className="task-meta">
          {showDate && event.start_date && (
            <span>{format(parseISO(event.start_date), 'MMM d')}</span>
          )}
          {event.start_time && <span>{event.start_time.slice(0,5)}</span>}
          {event.duration_minutes > 0 && (
            <span>
              {event.duration_minutes >= 60
                ? `${Math.floor(event.duration_minutes/60)}h${event.duration_minutes % 60 > 0 ? ` ${event.duration_minutes % 60}m` : ''}`
                : `${event.duration_minutes}m`}
            </span>
          )}
          {showTab && <span style={{ color, textTransform: 'capitalize' }}>{event.tab}</span>}
          {event.recurrence !== 'none' && (
            <span className="task-recur-badge">↻ {event.recurrence}</span>
          )}
          {event.source === 'canvas' && <span style={{ color: '#c084fc' }}>Canvas</span>}
        </div>
      </div>
      <div className="task-actions">
        {onDelete && (
          <button className="icon-btn del" onClick={() => onDelete(event.id)}>✕</button>
        )}
      </div>
    </div>
  )
}
