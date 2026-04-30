import { useState } from 'react'
import { format, addDays, isToday, isBefore, parseISO } from 'date-fns'
import { useEvents } from '../lib/useEvents'
import { updateEvent } from '../lib/db'
import TaskItem from '../components/TaskItem'
import EventModal from '../components/EventModal'
import Modal from '../components/Modal'

const TODAY = format(new Date(), 'yyyy-MM-dd')
const NOW = new Date()

function isLate(ev) {
  // Only today's tasks can be late — past days are auto-completed on import
  if (!ev.start_date || ev.start_date !== TODAY) return false
  // If it has a time and that time has passed today, it's late
  if (ev.start_time) {
    const [h, m] = ev.start_time.split(':').map(Number)
    const taskTime = new Date()
    taskTime.setHours(h, m, 0, 0)
    return isBefore(taskTime, NOW)
  }
  return false
}

export default function Home() {
  const { events, addEvent, toggleEvent, removeEvent, reload } = useEvents('everything')
  const [weekOpen, setWeekOpen] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [rescheduleEv, setRescheduleEv] = useState(null)
  const [rescheduleDate, setRescheduleDate] = useState('')

  const todayEvents = events.filter(e => e.start_date === TODAY)
  // Late = today's tasks whose time has already passed
  const todayLate = todayEvents.filter(e => isLate(e))
  const todayPending = todayEvents.filter(e => !isLate(e))

  const handleDoToday = async (ev) => {
    const id = ev._baseId || ev.id
    await updateEvent(id, { start_date: TODAY })
    await reload()
  }

  const handleReschedule = async () => {
    if (!rescheduleDate || !rescheduleEv) return
    const id = rescheduleEv._baseId || rescheduleEv.id
    await updateEvent(id, { start_date: rescheduleDate })
    setRescheduleEv(null)
    setRescheduleDate('')
    await reload()
  }

  const handleAdd = async (data) => {
    await addEvent(data)
    setShowModal(false)
  }

  const greeting = (() => {
    const h = new Date().getHours()
    if (h < 12) return 'Good morning'
    if (h < 17) return 'Good afternoon'
    return 'Good evening'
  })()

  // Week glance (tomorrow → +6 days)
  const weekDays = Array.from({ length: 6 }, (_, i) => {
    const d = addDays(new Date(), i + 1)
    const ds = format(d, 'yyyy-MM-dd')
    return { date: d, dateStr: ds, label: format(d, 'EEEE, MMM d'), events: events.filter(e => e.start_date === ds) }
  }).filter(d => d.events.length > 0)

  const allLate = todayLate

  return (
    <div className="home-page">
      <div className="home-greeting">{greeting}, Jaiveer.</div>
      <div className="home-date">{format(new Date(), 'EEEE · MMMM d, yyyy').toUpperCase()}</div>

      {/* LATE section */}
      {allLate.length > 0 && (
        <div style={{ marginBottom: 28 }}>
          <div className="home-section-label" style={{ color: '#f87171' }}>
            LATE · {allLate.length} TASK{allLate.length !== 1 ? 'S' : ''}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {allLate.map(ev => (
              <LateTaskItem
                key={ev.id}
                event={ev}
                onToggle={toggleEvent}
                onDelete={removeEvent}
                onDoToday={handleDoToday}
                onReschedule={(e) => { setRescheduleEv(e); setRescheduleDate(TODAY) }}
              />
            ))}
          </div>
        </div>
      )}

      {/* TODAY section */}
      <div className="home-section-label">TODAY</div>
      <div className="today-tasks">
        {todayPending.length === 0 && allLate.length === 0 && (
          <div className="empty-day">Nothing scheduled today — you're clear.</div>
        )}
        {todayPending.length === 0 && allLate.length > 0 && (
          <div className="empty-day">No more tasks for today.</div>
        )}
        {todayPending.map(ev => (
          <TaskItem key={ev.id} event={ev} onToggle={toggleEvent} onDelete={removeEvent} showTab />
        ))}
      </div>

      <button className="btn-add" style={{ marginBottom: 20 }} onClick={() => setShowModal(true)}>
        + Add task for today
      </button>

      {/* REST OF WEEK */}
      <button className={`week-toggle${weekOpen ? ' open' : ''}`} onClick={() => setWeekOpen(o => !o)}>
        <span>Rest of this week</span>
        {weekDays.length > 0 && (
          <span style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--t-3)', marginLeft: 4 }}>
            {weekDays.reduce((a, d) => a + d.events.length, 0)} tasks
          </span>
        )}
        <span className="week-toggle-chevron">▼</span>
      </button>

      <div className={`week-section${weekOpen ? ' open' : ''}`}>
        {weekDays.length === 0 && (
          <div style={{ padding: '16px 0', color: 'var(--t-3)', fontSize: 13, fontStyle: 'italic' }}>
            Nothing else this week.
          </div>
        )}
        {weekDays.map(({ date, dateStr, label, events: dayEvents }) => (
          <div key={dateStr} className="week-day-group">
            <div className="week-day-label">
              {label.toUpperCase()}
              <span className="week-day-count">{dayEvents.length}</span>
            </div>
            {dayEvents.map(ev => (
              <TaskItem key={ev.id} event={ev} onToggle={toggleEvent} onDelete={removeEvent} showTab />
            ))}
          </div>
        ))}
      </div>

      {/* Add task modal */}
      {showModal && (
        <EventModal initialDate={TODAY} onSave={handleAdd} onClose={() => setShowModal(false)} />
      )}

      {/* Reschedule modal */}
      {rescheduleEv && (
        <Modal title={`Reschedule "${rescheduleEv.title}"`} onClose={() => setRescheduleEv(null)}>
          <div style={{ fontSize: 12, color: 'var(--t-2)' }}>Pick a new date for this task.</div>
          <input
            type="date"
            value={rescheduleDate}
            min={TODAY}
            onChange={e => setRescheduleDate(e.target.value)}
          />
          <div className="modal-actions">
            <button className="btn-ghost" onClick={() => setRescheduleEv(null)}>Cancel</button>
            <button className="btn-primary" onClick={handleReschedule}>Reschedule</button>
          </div>
        </Modal>
      )}
    </div>
  )
}

function LateTaskItem({ event, onToggle, onDelete, onDoToday, onReschedule }) {
  const TAB_COLORS = { general: '#60a5fa', school: '#c084fc', college: '#f59e0b' }
  const color = TAB_COLORS[event.tab] || 'var(--t-3)'

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
      padding: '10px 12px',
      background: 'rgba(248,113,113,0.05)',
      border: '1px solid rgba(248,113,113,0.2)',
      borderRadius: 8,
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <div
          className={`task-checkbox${event.completed ? ' checked' : ''}`}
          onClick={() => onToggle(event)}
        />
        <div style={{ width: 2.5, borderRadius: 99, background: color, alignSelf: 'stretch', minHeight: 16, flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ fontSize: 13, color: 'var(--t-1)' }}>{event.title}</div>
            <span style={{
              fontSize: 9, padding: '1px 6px', borderRadius: 99,
              background: 'rgba(248,113,113,0.15)', color: '#f87171',
              border: '1px solid rgba(248,113,113,0.3)',
              fontFamily: 'var(--f-mono)', letterSpacing: '0.08em', flexShrink: 0,
            }}>LATE</span>
            {event.is_meeting && (
              <span style={{
                fontSize: 9, padding: '1px 6px', borderRadius: 99,
                background: 'rgba(96,165,250,0.12)', color: '#60a5fa',
                border: '1px solid rgba(96,165,250,0.2)',
                fontFamily: 'var(--f-mono)', letterSpacing: '0.06em', flexShrink: 0,
              }}>MEETING</span>
            )}
          </div>
          <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--t-3)', marginTop: 3, display: 'flex', gap: 8 }}>
            {event.start_date && <span>{format(parseISO(event.start_date), 'MMM d')}</span>}
            {event.start_time && <span>{event.start_time.slice(0,5)}</span>}
            <span style={{ color, textTransform: 'capitalize' }}>{event.tab}</span>
          </div>
        </div>
        <button className="icon-btn del" onClick={() => onDelete(event)}>✕</button>
      </div>
      {/* Action row */}
      <div style={{ display: 'flex', gap: 8, paddingLeft: 26 }}>
        <button
          onClick={() => onDoToday(event)}
          style={{
            background: 'var(--bg-3)', border: '1px solid var(--b-2)',
            color: 'var(--t-2)', fontFamily: 'var(--f-mono)', fontSize: 10,
            padding: '4px 12px', borderRadius: 6, cursor: 'pointer',
            letterSpacing: '0.06em', transition: 'all 0.12s',
          }}
        >
          DO TODAY
        </button>
        <button
          onClick={() => onReschedule(event)}
          style={{
            background: 'transparent', border: '1px solid var(--b-2)',
            color: 'var(--t-3)', fontFamily: 'var(--f-mono)', fontSize: 10,
            padding: '4px 12px', borderRadius: 6, cursor: 'pointer',
            letterSpacing: '0.06em', transition: 'all 0.12s',
          }}
        >
          RESCHEDULE
        </button>
      </div>
    </div>
  )
}
