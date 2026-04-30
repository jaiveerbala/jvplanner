import { useState, useEffect } from 'react'
import {
  format, startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  addDays, addMonths, subMonths, isSameMonth, isToday, parseISO, isPast
} from 'date-fns'
import { useEvents } from '../lib/useEvents'
import { useAuth } from '../lib/AuthContext'
import { getMilestones, createMilestone, updateMilestone, deleteMilestone } from '../lib/db'
import TaskItem from '../components/TaskItem'
import EventModal from '../components/EventModal'
import Modal from '../components/Modal'

const TRACKS = [
  { id: 'Summer Programs',   icon: '☀️' },
  { id: 'Internship',        icon: '💼' },
  { id: 'Research',          icon: '🔬' },
  { id: 'Project Portfolio', icon: '📁' },
  { id: 'Science Fairs',     icon: '🏆' },
  { id: 'Leadership',        icon: '⚡' },
]

const STATUS_CYCLE = ['not-started', 'in-progress', 'done', 'applied']
const STATUS_LABELS = { 'not-started': 'Not started', 'in-progress': 'In progress', done: 'Done', applied: 'Applied' }

export default function College() {
  const { user } = useAuth()
  const { events, addEvent, toggleEvent, removeEvent } = useEvents('college')
  const [milestones, setMilestones] = useState([])
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [selectedDate, setSelectedDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [showEventModal, setShowEventModal] = useState(false)
  const [showMsModal, setShowMsModal] = useState(false)
  const [spreadsheetOpen, setSpreadsheetOpen] = useState(true)
  const [collapsedTracks, setCollapsedTracks] = useState({})
  const [gradeFilter, setGradeFilter] = useState('all')
  const [msForm, setMsForm] = useState({ title: '', track: 'Summer Programs', grade_year: 9, status: 'not-started', deadline: '', notes: '' })

  useEffect(() => {
    if (user) getMilestones(user.id).then(setMilestones)
  }, [user])

  // Calendar grid
  const monthStart = startOfMonth(currentMonth)
  const monthEnd = endOfMonth(currentMonth)
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 0 })
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 0 })
  const days = []
  let cur = gridStart
  while (cur <= gridEnd) { days.push(cur); cur = addDays(cur, 1) }

  const todayStr = format(new Date(), 'yyyy-MM-dd')
  const getForDate = (ds) => events.filter(e => e.start_date === ds)
  const getForDateCalendar = (ds) => ds < todayStr ? [] : events.filter(e => e.start_date === ds && !e.completed)
  const selectedEvents = getForDate(selectedDate)
  const pending = selectedEvents.filter(e => !e.completed)
  const done = selectedEvents.filter(e => e.completed)

  // Milestones filtered
  const filteredMs = milestones.filter(m => gradeFilter === 'all' || m.grade_year === parseInt(gradeFilter))

  const cycleStatus = async (m) => {
    const next = STATUS_CYCLE[(STATUS_CYCLE.indexOf(m.status) + 1) % STATUS_CYCLE.length]
    const updated = await updateMilestone(m.id, { status: next })
    setMilestones(prev => prev.map(x => x.id === m.id ? updated : x))
  }

  const handleMsSave = async () => {
    if (!msForm.title.trim()) return
    const created = await createMilestone(user.id, { ...msForm, deadline: msForm.deadline || null })
    setMilestones(prev => [...prev, created])
    setShowMsModal(false)
    setMsForm({ title: '', track: 'Summer Programs', grade_year: 9, status: 'not-started', deadline: '', notes: '' })
  }

  const handleMsDelete = async (id) => {
    await deleteMilestone(id)
    setMilestones(prev => prev.filter(m => m.id !== id))
  }

  const toggleTrack = (id) => setCollapsedTracks(p => ({ ...p, [id]: !p[id] }))

  return (
    <div className="college-layout">
      {/* TOP: calendar + side panel */}
      <div className="college-top">
        {/* Calendar */}
        <div className="cal-area">
          <div className="cal-header">
            <div className="cal-title-row">
              <div className="cal-nav-btns">
                <button className="cal-nav-btn" onClick={() => setCurrentMonth(m => subMonths(m, 1))}>←</button>
                <button className="cal-nav-btn" onClick={() => setCurrentMonth(m => addMonths(m, 1))}>→</button>
              </div>
              <div className="cal-month">{format(currentMonth, 'MMMM yyyy')}</div>
            </div>
            <div className="cal-header-right">
              <button className="btn-primary" onClick={() => setShowEventModal(true)}>+ Add</button>
            </div>
          </div>

          <div className="cal-grid-wrap">
            <div className="cal-weekdays">
              {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d => (
                <div key={d} className="cal-weekday">{d}</div>
              ))}
            </div>
            <div className="cal-cells">
              {days.map(day => {
                const ds = format(day, 'yyyy-MM-dd')
                const dayEvents = getForDateCalendar(ds)
                return (
                  <div
                    key={ds}
                    className={[
                      'cal-cell',
                      isToday(day) ? 'today' : '',
                      !isSameMonth(day, currentMonth) ? 'other-month' : '',
                      ds === selectedDate ? 'selected' : '',
                    ].join(' ')}
                    onClick={() => setSelectedDate(ds)}
                  >
                    <div className="cal-cell-num">{format(day, 'd')}</div>
                    <div className="cal-cell-events">
                      {dayEvents.slice(0, 3).map((ev, i) => (
                        <div key={i} className="cal-chip college">{ev.title}</div>
                      ))}
                      {dayEvents.length > 3 && <div className="cal-overflow">+{dayEvents.length - 3}</div>}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {/* Side panel */}
        <div className="side-panel">
          <div className="side-panel-header">
            <div className="side-panel-date">{format(parseISO(selectedDate), 'EEEE, MMMM d')}</div>
            <div className="side-panel-sub">
              {selectedEvents.length === 0 ? 'Nothing scheduled' : `${pending.length} pending · ${done.length} done`}
            </div>
          </div>
          <div className="side-panel-body">
            {selectedEvents.length === 0 && <div className="side-panel-empty">Nothing on this day.</div>}
            {pending.map(ev => <TaskItem key={ev.id} event={ev} onToggle={toggleEvent} onDelete={removeEvent} />)}
            {done.length > 0 && (
              <>
                <div style={{ fontSize: 10, fontFamily: 'var(--f-mono)', color: 'var(--t-4)', letterSpacing: '0.1em', margin: '8px 0 4px' }}>COMPLETED</div>
                {done.map(ev => <TaskItem key={ev.id} event={ev} onToggle={toggleEvent} onDelete={removeEvent} />)}
              </>
            )}
          </div>
          <div className="side-panel-footer">
            <button className="btn-add" onClick={() => setShowEventModal(true)}>
              + Add task on {format(parseISO(selectedDate), 'MMM d')}
            </button>
          </div>
        </div>
      </div>

      {/* BOTTOM: college track spreadsheet */}
      <div className="college-bottom">
        <div className="college-bottom-header" onClick={() => setSpreadsheetOpen(o => !o)}>
          <div className="college-bottom-label">
            COLLEGE TRACK
            <span style={{ color: 'var(--t-4)', fontWeight: 400 }}>
              {milestones.length} milestones
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {/* Grade filter */}
            <div style={{ display: 'flex', gap: 4 }} onClick={e => e.stopPropagation()}>
              {['all','9','10','11','12'].map(g => (
                <button
                  key={g}
                  onClick={() => setGradeFilter(g)}
                  style={{
                    background: gradeFilter === g ? 'var(--accent-dim)' : 'transparent',
                    border: '1px solid',
                    borderColor: gradeFilter === g ? 'var(--accent)' : 'var(--b-1)',
                    color: gradeFilter === g ? 'var(--accent-text)' : 'var(--t-3)',
                    fontFamily: 'var(--f-mono)',
                    fontSize: 9,
                    padding: '2px 8px',
                    borderRadius: 99,
                    cursor: 'pointer',
                    letterSpacing: '0.08em',
                  }}
                >
                  {g === 'all' ? 'All' : `${g}th`}
                </button>
              ))}
            </div>
            <button
              className="btn-primary"
              style={{ fontSize: 11, padding: '5px 10px' }}
              onClick={e => { e.stopPropagation(); setShowMsModal(true) }}
            >
              + Milestone
            </button>
            <span style={{ fontSize: 10, color: 'var(--t-3)' }}>{spreadsheetOpen ? '▼' : '▲'}</span>
          </div>
        </div>

        {spreadsheetOpen && (
          <div className="college-bottom-body">
            {TRACKS.map(({ id, icon }) => {
              const items = filteredMs.filter(m => m.track === id)
              const isCollapsed = collapsedTracks[id]
              return (
                <div key={id} className={`track-section${isCollapsed ? ' collapsed' : ''}`}>
                  <div className="track-header" onClick={() => toggleTrack(id)}>
                    <span className="track-icon">{icon}</span>
                    <span className="track-name">{id}</span>
                    <span className="track-count">{items.length}</span>
                    <span className="track-chev">▼</span>
                  </div>
                  <div className="track-rows">
                    {items.map(m => {
                      const overdue = m.deadline && isPast(parseISO(m.deadline)) && m.status !== 'done'
                      return (
                        <div key={m.id} className="milestone-row">
                          <span className="milestone-row-title">{m.title}</span>
                          <span className="milestone-row-grade">{m.grade_year}th</span>
                          <button className={`status-btn ${m.status}`} onClick={() => cycleStatus(m)}>
                            {STATUS_LABELS[m.status]}
                          </button>
                          <span className={`milestone-row-deadline${overdue ? ' overdue' : ''}`}>
                            {m.deadline ? format(parseISO(m.deadline), 'MMM d, yy') : '—'}
                          </span>
                          <button className="ms-del-btn" onClick={() => handleMsDelete(m.id)}>✕</button>
                        </div>
                      )
                    })}
                    {items.length === 0 && (
                      <div style={{ padding: '8px 20px 8px 44px', fontSize: 11, color: 'var(--t-4)', fontStyle: 'italic' }}>
                        Nothing added yet.
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {showEventModal && (
        <EventModal
          initialDate={selectedDate}
          forcedTab="college"
          onSave={async (d) => { await addEvent(d); setShowEventModal(false) }}
          onClose={() => setShowEventModal(false)}
        />
      )}

      {showMsModal && (
        <Modal title="New Milestone" onClose={() => setShowMsModal(false)}>
          <input autoFocus placeholder="Milestone title" value={msForm.title} onChange={e => setMsForm(p => ({ ...p, title: e.target.value }))} />
          <div className="form-row">
            <div className="form-group">
              <div className="form-label">TRACK</div>
              <select value={msForm.track} onChange={e => setMsForm(p => ({ ...p, track: e.target.value }))}>
                {TRACKS.map(t => <option key={t.id} value={t.id}>{t.id}</option>)}
              </select>
            </div>
            <div className="form-group">
              <div className="form-label">GRADE YEAR</div>
              <select value={msForm.grade_year} onChange={e => setMsForm(p => ({ ...p, grade_year: parseInt(e.target.value) }))}>
                <option value={9}>9th</option><option value={10}>10th</option>
                <option value={11}>11th</option><option value={12}>12th</option>
              </select>
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <div className="form-label">STATUS</div>
              <select value={msForm.status} onChange={e => setMsForm(p => ({ ...p, status: e.target.value }))}>
                {STATUS_CYCLE.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
              </select>
            </div>
            <div className="form-group">
              <div className="form-label">DEADLINE</div>
              <input type="date" value={msForm.deadline} onChange={e => setMsForm(p => ({ ...p, deadline: e.target.value }))} />
            </div>
          </div>
          <textarea placeholder="Notes..." value={msForm.notes} onChange={e => setMsForm(p => ({ ...p, notes: e.target.value }))} />
          <div className="modal-actions">
            <button className="btn-ghost" onClick={() => setShowMsModal(false)}>Cancel</button>
            <button className="btn-primary" onClick={handleMsSave}>Save</button>
          </div>
        </Modal>
      )}
    </div>
  )
}
