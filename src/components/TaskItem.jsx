import { format, parseISO } from 'date-fns'

const TAB_COLORS = { general: '#60a5fa', school: '#c084fc', college: '#f59e0b' }

export default function TaskItem({ event, onToggle, onDelete, onEdit, showTab, showDate }) {
  const color = TAB_COLORS[event.tab] || 'var(--t-3)'

  const fmtDur = (m) => m >= 60
    ? `${Math.floor(m / 60)}h${m % 60 > 0 ? ` ${m % 60}m` : ''}`
    : `${m}m`

  return (
    <div
      className={`task-item${event.completed ? ' done' : ''}${event.priority ? ' priority' : ''}`}
      onClick={e => {
        if (!onEdit) return
        if (e.target.closest('.task-checkbox') || e.target.closest('.icon-btn')) return
        onEdit(event)
      }}
      style={onEdit ? { cursor: 'pointer' } : undefined}
    >
      <div
        className={`task-checkbox${event.completed ? ' checked' : ''}`}
        onClick={e => { e.stopPropagation(); onToggle(event) }}
      />
      <div className="task-color-bar" style={{ background: event.priority ? '#f87171' : color }} />
      <div className="task-body">
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <div className="task-title">{event.title}</div>
          {event.priority && <span className="priority-badge">PRIORITY</span>}
          {event.is_meeting && <span className="meeting-badge">MEETING</span>}
        </div>
        <div className="task-meta">
          {showDate && event.start_date && <span>{format(parseISO(event.start_date), 'MMM d')}</span>}
          {event.start_time && <span>{event.start_time.slice(0, 5)}</span>}
          {event.duration_minutes > 0 && <span>{fmtDur(event.duration_minutes)}</span>}
          {showTab && <span style={{ color, textTransform: 'capitalize' }}>{event.tab}</span>}
          {event._recurring && <span className="task-recur-badge">↻ {event.recurrence}</span>}
        </div>
      </div>
      <div className="task-actions">
        <button className="icon-btn del" onClick={e => { e.stopPropagation(); onDelete(event) }}>✕</button>
      </div>
    </div>
  )
}