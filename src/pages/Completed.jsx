import { useEvents } from '../lib/useEvents'
import { format, parseISO } from 'date-fns'

const TAB_COLORS = { general: '#60a5fa', school: '#c084fc', college: '#f59e0b' }

export default function Completed() {
  const { events, restoreEvent, removeEvent } = useEvents('completed')

  // Group by completed date
  const groups = {}
  for (const ev of events) {
    const dateKey = ev.completed_at
      ? format(parseISO(ev.completed_at), 'yyyy-MM-dd')
      : ev.start_date || 'unknown'
    if (!groups[dateKey]) groups[dateKey] = []
    groups[dateKey].push(ev)
  }

  const sortedDates = Object.keys(groups).sort((a, b) => b.localeCompare(a))

  return (
    <div style={{ height: '100%', overflowY: 'auto', padding: '36px 48px', maxWidth: 760 }}>
      <div style={{ marginBottom: 32 }}>
        <div style={{ fontFamily: 'var(--f-display)', fontSize: 22, fontWeight: 700, letterSpacing: '-0.01em', marginBottom: 6 }}>
          Completed
        </div>
        <div style={{ fontFamily: 'var(--f-mono)', fontSize: 11, color: 'var(--t-3)', letterSpacing: '0.06em' }}>
          {events.length} task{events.length !== 1 ? 's' : ''} completed all time
        </div>
      </div>

      {events.length === 0 && (
        <div style={{ color: 'var(--t-3)', fontSize: 13, fontStyle: 'italic' }}>
          Nothing completed yet.
        </div>
      )}

      {sortedDates.map(dateKey => (
        <div key={dateKey} style={{ marginBottom: 28 }}>
          <div style={{
            fontFamily: 'var(--f-mono)',
            fontSize: 10,
            letterSpacing: '0.12em',
            color: 'var(--t-3)',
            marginBottom: 10,
            paddingBottom: 8,
            borderBottom: '1px solid var(--b-1)',
          }}>
            {dateKey === 'unknown' ? 'UNKNOWN DATE' : format(parseISO(dateKey), 'EEEE, MMMM d, yyyy').toUpperCase()}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {groups[dateKey].map(ev => {
              const color = TAB_COLORS[ev.tab] || 'var(--t-3)'
              return (
                <div key={ev.id} style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '10px 14px',
                  background: 'var(--bg-2)',
                  border: '1px solid var(--b-1)',
                  borderRadius: 8,
                  opacity: 0.7,
                }}>
                  {/* Checked box */}
                  <div style={{
                    width: 16, height: 16,
                    borderRadius: 5,
                    background: color,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0,
                  }}>
                    <div style={{
                      width: 8, height: 5,
                      borderLeft: '2px solid #0c1714',
                      borderBottom: '2px solid #0c1714',
                      transform: 'rotate(-45deg) translate(1px,-1px)',
                    }} />
                  </div>

                  <div style={{ width: 2.5, borderRadius: 99, background: color, alignSelf: 'stretch', minHeight: 16, flexShrink: 0 }} />

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, color: 'var(--t-2)', textDecoration: 'line-through' }}>
                      {ev.title}
                    </div>
                    <div style={{ display: 'flex', gap: 8, marginTop: 3, fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--t-3)' }}>
                      {ev.start_date && <span>Due {format(parseISO(ev.start_date), 'MMM d')}</span>}
                      {ev.start_time && <span>{ev.start_time.slice(0,5)}</span>}
                      <span style={{ color, textTransform: 'capitalize' }}>{ev.tab}</span>
                      {ev.is_meeting && <span style={{ color: '#60a5fa' }}>Meeting</span>}
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    <button
                      onClick={() => restoreEvent(ev)}
                      style={{
                        background: 'var(--bg-3)',
                        border: '1px solid var(--b-2)',
                        color: 'var(--t-2)',
                        fontFamily: 'var(--f-mono)',
                        fontSize: 10,
                        padding: '4px 10px',
                        borderRadius: 6,
                        cursor: 'pointer',
                        letterSpacing: '0.06em',
                        transition: 'all 0.12s',
                      }}
                      onMouseEnter={e => { e.target.style.borderColor = 'var(--accent)'; e.target.style.color = 'var(--accent-text)' }}
                      onMouseLeave={e => { e.target.style.borderColor = 'var(--b-2)'; e.target.style.color = 'var(--t-2)' }}
                    >
                      UNDO
                    </button>
                    <button
                      onClick={() => removeEvent(ev)}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: 'var(--t-4)',
                        cursor: 'pointer',
                        fontSize: 13,
                        padding: '0 4px',
                        borderRadius: 4,
                        transition: 'color 0.12s',
                      }}
                      onMouseEnter={e => e.target.style.color = '#f87171'}
                      onMouseLeave={e => e.target.style.color = 'var(--t-4)'}
                    >
                      ✕
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
