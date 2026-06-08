import { useState, useEffect, useRef, useCallback } from 'react'
import { format, addDays, isBefore, parseISO } from 'date-fns'
import { useEvents } from '../lib/useEvents'
import { supabase } from '../lib/supabase'
import TaskItem from '../components/TaskItem'
import EventModal from '../components/EventModal'
import Modal from '../components/Modal'

const TODAY = format(new Date(), 'yyyy-MM-dd')
const NOW = new Date()

// Hour height in pixels for the day planner (15min = SLOT_H)
const SLOT_H = 16 // px per 15 minutes
const HOUR_H = SLOT_H * 4 // 64px per hour

function isLate(ev) {
  if (ev._recurring || (ev.recurrence && ev.recurrence !== 'none')) return false
  if (!ev.start_date || ev.start_date !== TODAY) return false
  if (ev.start_time) {
    const [h, m] = ev.start_time.split(':').map(Number)
    const taskTime = new Date()
    taskTime.setHours(h, m, 0, 0)
    return isBefore(taskTime, NOW)
  }
  return false
}

function timeToY(timeStr) {
  if (!timeStr) return null
  const [h, m] = timeStr.split(':').map(Number)
  return (h * 60 + m) / 15 * SLOT_H
}

function yToTime(y) {
  const totalMins = Math.round(y / SLOT_H) * 15
  const h = Math.floor(totalMins / 60) % 24
  const m = totalMins % 60
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:00`
}

function minutesToH(mins) {
  return Math.max(SLOT_H, (mins / 15) * SLOT_H)
}

export default function Home() {
  const { events, addEvent, toggleEvent, removeEvent, reload } = useEvents('everything')
  const [weekOpen, setWeekOpen] = useState(false)
  const [showAddModal, setShowAddModal] = useState(false)
  const [editEvent, setEditEvent] = useState(null)
  const [rescheduleEv, setRescheduleEv] = useState(null)
  const [rescheduleDate, setRescheduleDate] = useState('')
  const [plannerBlocks, setPlannerBlocks] = useState([]) // {id, eventId, startTime, durationMins, title, tab, isFree}
  const [dragging, setDragging] = useState(null)
  const [resizing, setResizing] = useState(null)
  const plannerRef = useRef(null)

  // Auto-reschedule past incomplete non-recurring tasks to today
  useEffect(() => {
    const run = async () => {
      const pastLate = events.filter(e =>
        !e._recurring &&
        (!e.recurrence || e.recurrence === 'none') &&
        e.start_date < TODAY &&
        !e.completed
      )
      for (const ev of pastLate) {
        await supabase.from('events').update({ start_date: TODAY }).eq('id', ev.id)
      }
      if (pastLate.length > 0) await reload()
    }
    if (events.length > 0) run()
  }, [events.length])

  // Load planner blocks from localStorage
  useEffect(() => {
    const saved = localStorage.getItem(`planner_${TODAY}`)
    if (saved) setPlannerBlocks(JSON.parse(saved))
  }, [])

  const savePlannerBlocks = useCallback((blocks) => {
    setPlannerBlocks(blocks)
    localStorage.setItem(`planner_${TODAY}`, JSON.stringify(blocks))
  }, [])

  const todayEvents = events.filter(e => e.start_date === TODAY)
  const todayLate = todayEvents.filter(e => isLate(e))
  const todayPending = todayEvents.filter(e => !isLate(e))
  const checkedOffIds = new Set(plannerBlocks.filter(b => {
    const ev = events.find(e => e.id === b.eventId || `${e._baseId}__0` === b.eventId)
    return ev?.completed
  }).map(b => b.id))

  const weekDays = Array.from({ length: 6 }, (_, i) => {
    const d = addDays(new Date(), i + 1)
    const ds = format(d, 'yyyy-MM-dd')
    return { date: d, dateStr: ds, label: format(d, 'EEEE, MMM d'), events: events.filter(e => e.start_date === ds) }
  }).filter(d => d.events.length > 0)

  const greeting = (() => {
    const h = new Date().getHours()
    if (h < 12) return 'Good morning'
    if (h < 17) return 'Good afternoon'
    return 'Good evening'
  })()

  // Drop task into planner
  const handlePlannerDrop = (e) => {
    e.preventDefault()
    const plannerRect = plannerRef.current.getBoundingClientRect()
    const y = e.clientY - plannerRect.top + plannerRef.current.scrollTop
    const startTime = yToTime(y)
    const data = JSON.parse(e.dataTransfer.getData('text/plain'))
    // Avoid duplicates
    if (plannerBlocks.find(b => b.eventId === data.id)) return
    const newBlock = {
      id: `block_${Date.now()}`,
      eventId: data.id,
      title: data.title,
      tab: data.tab,
      startTime,
      durationMins: data.durationMins || 60,
      isMeeting: data.isMeeting,
      isFree: false,
    }
    savePlannerBlocks([...plannerBlocks, newBlock])
  }

  const handleAddFreeBlock = () => {
    const newBlock = {
      id: `free_${Date.now()}`,
      eventId: null,
      title: 'Free time',
      tab: 'general',
      startTime: '12:00:00',
      durationMins: 60,
      isFree: true,
    }
    savePlannerBlocks([...plannerBlocks, newBlock])
  }

  const handleRemoveBlock = (blockId) => {
    savePlannerBlocks(plannerBlocks.filter(b => b.id !== blockId))
  }

  // Drag block within planner
  const handleBlockMouseDown = (e, blockId, type) => {
    e.preventDefault()
    const plannerRect = plannerRef.current.getBoundingClientRect()
    const startY = e.clientY
    const block = plannerBlocks.find(b => b.id === blockId)
    const origY = timeToY(block.startTime)
    const origDur = block.durationMins

    const onMove = (me) => {
      const dy = me.clientY - startY
      if (type === 'drag') {
        const newY = Math.max(0, origY + dy)
        const newTime = yToTime(newY)
        savePlannerBlocks(plannerBlocks.map(b => b.id === blockId ? { ...b, startTime: newTime } : b))
      } else if (type === 'resize') {
        const newDur = Math.max(15, origDur + Math.round(dy / SLOT_H) * 15)
        savePlannerBlocks(plannerBlocks.map(b => b.id === blockId ? { ...b, durationMins: newDur } : b))
      }
    }
    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  const handleSaveEdit = async (data) => {
    await supabase.from('events').update({
      title: data.title,
      notes: data.notes,
      start_date: data.start_date,
      start_time: data.start_time || null,
      duration_minutes: data.duration_minutes || 0,
      recurrence: data.recurrence,
      recurrence_end: data.recurrence_end || null,
      is_meeting: data.is_meeting,
      tab: data.tab,
    }).eq('id', editEvent._baseId || editEvent.id)
    setEditEvent(null)
    await reload()
  }

  // Hours for planner
  const hours = Array.from({ length: 24 }, (_, i) => i)
  const TAB_COLORS = { general: '#60a5fa', school: '#c084fc', college: '#f59e0b' }
  const currentHourY = (NOW.getHours() * 60 + NOW.getMinutes()) / 15 * SLOT_H

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
      {/* LEFT: Todo list */}
      <div className="home-page" style={{ flex: '0 0 520px', borderRight: '1px solid var(--b-1)', overflowY: 'auto' }}>
        <div className="home-greeting">{greeting}, Jaiveer.</div>
        <div className="home-date">{format(new Date(), 'EEEE · MMMM d, yyyy').toUpperCase()}</div>

        {/* LATE */}
        {todayLate.length > 0 && (
          <div style={{ marginBottom: 24 }}>
            <div className="home-section-label" style={{ color: '#f87171' }}>
              LATE · {todayLate.length} TASK{todayLate.length !== 1 ? 'S' : ''}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {todayLate.map(ev => (
                <LateTaskItem key={ev.id} event={ev}
                  onToggle={toggleEvent} onDelete={removeEvent}
                  onDoToday={async (ev) => { await supabase.from('events').update({ start_date: TODAY }).eq('id', ev._baseId || ev.id); await reload() }}
                  onReschedule={(e) => { setRescheduleEv(e); setRescheduleDate(TODAY) }}
                  onEdit={setEditEvent}
                />
              ))}
            </div>
          </div>
        )}

        {/* TODAY */}
        <div className="home-section-label">TODAY</div>
        <div className="today-tasks">
          {todayPending.length === 0 && todayLate.length === 0 && (
            <div className="empty-day">Nothing scheduled today — you're clear.</div>
          )}
          {todayPending.map(ev => (
            <DraggableTaskItem key={ev.id} event={ev}
              onToggle={toggleEvent} onDelete={removeEvent} onEdit={setEditEvent}
            />
          ))}
        </div>

        <button className="btn-add" style={{ marginBottom: 20 }} onClick={() => setShowAddModal(true)}>
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
            <div style={{ padding: '16px 0', color: 'var(--t-3)', fontSize: 13, fontStyle: 'italic' }}>Nothing else this week.</div>
          )}
          {weekDays.map(({ dateStr, label, events: dayEvents }) => (
            <div key={dateStr} className="week-day-group">
              <div className="week-day-label">
                {label.toUpperCase()}
                <span className="week-day-count">{dayEvents.length}</span>
              </div>
              {dayEvents.map(ev => (
                <DraggableTaskItem key={ev.id} event={ev}
                  onToggle={toggleEvent} onDelete={removeEvent} onEdit={setEditEvent}
                />
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* RIGHT: Day planner */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--bg-2)' }}>
        <div style={{ padding: '20px 20px 12px', borderBottom: '1px solid var(--b-1)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10, letterSpacing: '0.12em', color: 'var(--t-3)' }}>DAY PLANNER</div>
          <button className="btn-ghost" style={{ fontSize: 10, padding: '4px 10px' }} onClick={handleAddFreeBlock}>+ Free time</button>
        </div>

        <div
          ref={plannerRef}
          style={{ flex: 1, overflowY: 'auto', position: 'relative', cursor: 'default' }}
          onDragOver={e => e.preventDefault()}
          onDrop={handlePlannerDrop}
        >
          {/* Hour grid */}
          {hours.map(h => (
            <div key={h} style={{
              position: 'absolute', left: 0, right: 0,
              top: h * HOUR_H,
              height: HOUR_H,
              borderTop: '1px solid var(--b-1)',
              pointerEvents: 'none',
            }}>
              <span style={{
                position: 'absolute', left: 8, top: -8,
                fontFamily: 'var(--f-mono)', fontSize: 9,
                color: 'var(--t-4)', letterSpacing: '0.06em',
              }}>
                {h === 0 ? '12 AM' : h < 12 ? `${h} AM` : h === 12 ? '12 PM' : `${h-12} PM`}
              </span>
            </div>
          ))}

          {/* Total height spacer */}
          <div style={{ height: 24 * HOUR_H }} />

          {/* Current time indicator */}
          <div style={{
            position: 'absolute', left: 40, right: 0,
            top: currentHourY,
            height: 2, background: 'var(--accent)',
            pointerEvents: 'none', zIndex: 10,
          }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--accent)', marginTop: -3, marginLeft: -4 }} />
          </div>

          {/* Planner blocks */}
          {plannerBlocks.filter(b => {
            // Hide if the linked task was checked off
            const ev = todayEvents.find(e => e.id === b.eventId)
            return !ev?.completed
          }).map(block => {
            const y = timeToY(block.startTime) || 0
            const h = minutesToH(block.durationMins)
            const color = TAB_COLORS[block.tab] || 'var(--t-3)'
            return (
              <div
                key={block.id}
                style={{
                  position: 'absolute',
                  left: 44, right: 8,
                  top: y,
                  height: h,
                  background: `${color}18`,
                  border: `1.5px solid ${color}55`,
                  borderRadius: 6,
                  padding: '4px 8px',
                  cursor: 'grab',
                  userSelect: 'none',
                  zIndex: 5,
                  overflow: 'hidden',
                }}
                onMouseDown={(e) => handleBlockMouseDown(e, block.id, 'drag')}
              >
                <div style={{ fontSize: 11, color, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {block.title}
                </div>
                <div style={{ fontSize: 9, color: 'var(--t-3)', fontFamily: 'var(--f-mono)' }}>
                  {block.startTime?.slice(0,5)} · {block.durationMins}min
                </div>
                <button
                  style={{ position: 'absolute', top: 2, right: 4, background: 'none', border: 'none', color: 'var(--t-3)', cursor: 'pointer', fontSize: 11, lineHeight: 1 }}
                  onMouseDown={e => e.stopPropagation()}
                  onClick={() => handleRemoveBlock(block.id)}
                >✕</button>
                {/* Resize handle */}
                <div
                  style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 8, cursor: 'ns-resize', background: `${color}30`, borderRadius: '0 0 6px 6px' }}
                  onMouseDown={(e) => { e.stopPropagation(); handleBlockMouseDown(e, block.id, 'resize') }}
                />
              </div>
            )
          })}
        </div>
      </div>

      {/* Modals */}
      {showAddModal && (
        <EventModal initialDate={TODAY} onSave={async (d) => { await addEvent(d); setShowAddModal(false) }} onClose={() => setShowAddModal(false)} />
      )}

      {editEvent && (
        <EventModal
          initialDate={editEvent.start_date}
          initialData={editEvent}
          onSave={handleSaveEdit}
          onClose={() => setEditEvent(null)}
          isEdit
        />
      )}

      {rescheduleEv && (
        <Modal title={`Reschedule "${rescheduleEv.title}"`} onClose={() => setRescheduleEv(null)}>
          <div style={{ fontSize: 12, color: 'var(--t-2)' }}>Pick a new date for this task.</div>
          <input type="date" value={rescheduleDate} min={TODAY} onChange={e => setRescheduleDate(e.target.value)} />
          <div className="modal-actions">
            <button className="btn-ghost" onClick={() => setRescheduleEv(null)}>Cancel</button>
            <button className="btn-primary" onClick={async () => {
              if (!rescheduleDate || !rescheduleEv) return
              await supabase.from('events').update({ start_date: rescheduleDate }).eq('id', rescheduleEv._baseId || rescheduleEv.id)
              setRescheduleEv(null)
              await reload()
            }}>Reschedule</button>
          </div>
        </Modal>
      )}
    </div>
  )
}

function DraggableTaskItem({ event, onToggle, onDelete, onEdit }) {
  const TAB_COLORS = { general: '#60a5fa', school: '#c084fc', college: '#f59e0b' }
  const color = TAB_COLORS[event.tab] || 'var(--t-3)'

  const handleDragStart = (e) => {
    e.dataTransfer.setData('text/plain', JSON.stringify({
      id: event.id,
      title: event.title,
      tab: event.tab,
      durationMins: event.duration_minutes || 60,
      isMeeting: event.is_meeting,
    }))
  }

  return (
    <div
      className={`task-item${event.completed ? ' done' : ''}`}
      draggable
      onDragStart={handleDragStart}
      onClick={(e) => {
        // Only open edit if not clicking checkbox or delete
        if (!e.target.closest('.task-checkbox') && !e.target.closest('.icon-btn')) {
          onEdit(event)
        }
      }}
      style={{ cursor: 'pointer' }}
    >
      <div className={`task-checkbox${event.completed ? ' checked' : ''}`}
        onClick={(e) => { e.stopPropagation(); onToggle(event) }} />
      <div className="task-color-bar" style={{ background: color }} />
      <div className="task-body">
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div className="task-title">{event.title}</div>
          {event.is_meeting && (
            <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 99, background: 'rgba(96,165,250,0.12)', color: '#60a5fa', border: '1px solid rgba(96,165,250,0.2)', fontFamily: 'var(--f-mono)', letterSpacing: '0.06em', flexShrink: 0 }}>MEETING</span>
          )}
        </div>
        <div className="task-meta">
          {event.start_time && <span>{event.start_time.slice(0,5)}</span>}
          {event.duration_minutes > 0 && <span>{event.duration_minutes >= 60 ? `${Math.floor(event.duration_minutes/60)}h${event.duration_minutes%60>0?` ${event.duration_minutes%60}m`:''}` : `${event.duration_minutes}m`}</span>}
          <span style={{ color, textTransform: 'capitalize' }}>{event.tab}</span>
          {event._recurring && <span className="task-recur-badge">↻ {event.recurrence}</span>}
        </div>
      </div>
      <div className="task-actions">
        <button className="icon-btn del" onClick={(e) => { e.stopPropagation(); onDelete(event) }}>✕</button>
      </div>
    </div>
  )
}

function LateTaskItem({ event, onToggle, onDelete, onDoToday, onReschedule, onEdit }) {
  const TAB_COLORS = { general: '#60a5fa', school: '#c084fc', college: '#f59e0b' }
  const color = TAB_COLORS[event.tab] || 'var(--t-3)'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '10px 12px', background: 'rgba(248,113,113,0.05)', border: '1px solid rgba(248,113,113,0.2)', borderRadius: 8, cursor: 'pointer' }}
      onClick={(e) => { if (!e.target.closest('.task-checkbox') && !e.target.closest('button')) onEdit(event) }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <div className={`task-checkbox${event.completed ? ' checked' : ''}`} onClick={(e) => { e.stopPropagation(); onToggle(event) }} />
        <div style={{ width: 2.5, borderRadius: 99, background: color, alignSelf: 'stretch', minHeight: 16, flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ fontSize: 13, color: 'var(--t-1)' }}>{event.title}</div>
            <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 99, background: 'rgba(248,113,113,0.15)', color: '#f87171', border: '1px solid rgba(248,113,113,0.3)', fontFamily: 'var(--f-mono)', letterSpacing: '0.08em', flexShrink: 0 }}>LATE</span>
          </div>
          <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--t-3)', marginTop: 3, display: 'flex', gap: 8 }}>
            {event.start_time && <span>{event.start_time.slice(0,5)}</span>}
            <span style={{ color, textTransform: 'capitalize' }}>{event.tab}</span>
          </div>
        </div>
        <button className="icon-btn del" onClick={(e) => { e.stopPropagation(); onDelete(event) }}>✕</button>
      </div>
      <div style={{ display: 'flex', gap: 8, paddingLeft: 26 }}>
        <button onClick={(e) => { e.stopPropagation(); onDoToday(event) }} style={{ background: 'var(--bg-3)', border: '1px solid var(--b-2)', color: 'var(--t-2)', fontFamily: 'var(--f-mono)', fontSize: 10, padding: '4px 12px', borderRadius: 6, cursor: 'pointer', letterSpacing: '0.06em' }}>DO TODAY</button>
        <button onClick={(e) => { e.stopPropagation(); onReschedule(event) }} style={{ background: 'transparent', border: '1px solid var(--b-2)', color: 'var(--t-3)', fontFamily: 'var(--f-mono)', fontSize: 10, padding: '4px 12px', borderRadius: 6, cursor: 'pointer', letterSpacing: '0.06em' }}>RESCHEDULE</button>
      </div>
    </div>
  )
}