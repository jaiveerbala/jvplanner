import { useState, useEffect, useRef } from 'react'
import { format, addDays, isBefore } from 'date-fns'
import { useEvents } from '../lib/useEvents'
import { useAuth } from '../lib/AuthContext'
import { supabase } from '../lib/supabase'
import EventModal from '../components/EventModal'
import Modal from '../components/Modal'

const TODAY = format(new Date(), 'yyyy-MM-dd')
const NOW = new Date()
const SLOT_H = 16
const HOUR_H = SLOT_H * 4
const TAB_COLORS = { general: '#60a5fa', school: '#c084fc', college: '#f59e0b' }

function isLate(ev) {
  if (ev._recurring || (ev.recurrence && ev.recurrence !== 'none')) return false
  if (!ev.start_date || ev.start_date !== TODAY) return false
  if (ev.start_time) {
    const [h, m] = ev.start_time.split(':').map(Number)
    const t = new Date(); t.setHours(h, m, 0, 0)
    return isBefore(t, NOW)
  }
  return false
}

function timeToY(t) {
  if (!t) return 0
  const [h, m] = t.split(':').map(Number)
  return (h * 60 + m) / 15 * SLOT_H
}

function yToTime(y) {
  const mins = Math.round(Math.max(0, y) / SLOT_H) * 15
  const h = Math.floor(mins / 60) % 24
  const m = mins % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`
}

// Priority tasks float to the top
function sortTasks(arr) {
  return [...arr].sort((a, b) => (b.priority ? 1 : 0) - (a.priority ? 1 : 0))
}

function useIsMobile() {
  const [mobile, setMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth < 900)
  useEffect(() => {
    const onResize = () => setMobile(window.innerWidth < 900)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  return mobile
}

const newBlockId = (p) => `${p}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`

export default function Home() {
  const { user } = useAuth()
  const { events, addEvent, toggleEvent, removeEvent, reload } = useEvents('everything')
  const isMobile = useIsMobile()

  const [mobileView, setMobileView] = useState('tasks') // tasks | planner
  const [weekOpen, setWeekOpen] = useState(false)
  const [showAddModal, setShowAddModal] = useState(false)
  const [editEvent, setEditEvent] = useState(null)
  const [rescheduleEv, setRescheduleEv] = useState(null)
  const [rescheduleDate, setRescheduleDate] = useState('')
  const [plannerBlocks, setPlannerBlocks] = useState([])
  const [planItems, setPlanItems] = useState([])
  const [openDropdown, setOpenDropdown] = useState(null)
  const plannerRef = useRef(null)
  const blocksRef = useRef([])
  blocksRef.current = plannerBlocks

  // Auto-reschedule past incomplete non-recurring tasks to today
  useEffect(() => {
    const run = async () => {
      const past = events.filter(e =>
        !e._recurring && (!e.recurrence || e.recurrence === 'none') &&
        e.start_date < TODAY && !e.completed
      )
      for (const ev of past) {
        await supabase.from('events').update({ start_date: TODAY }).eq('id', ev.id)
      }
      if (past.length > 0) await reload()
    }
    if (events.length > 0) run()
  }, [events.length])

  // Load planner blocks for today
  useEffect(() => {
    if (!user) return
    supabase.from('day_planner').select('*')
      .eq('user_id', user.id).eq('plan_date', TODAY).order('created_at')
      .then(({ data }) => {
        if (data) setPlannerBlocks(data.map(r => ({
          id: r.id, eventId: r.event_id, planItemId: r.plan_item_id,
          title: r.title, tab: r.tab, startTime: r.start_time,
          durationMins: r.duration_mins, isFree: r.is_free, isPlan: r.is_plan,
        })))
      })
  }, [user])

  // Load plan items
  useEffect(() => {
    if (!user) return
    supabase.from('plan_items').select('*').eq('user_id', user.id).order('created_at')
      .then(({ data }) => setPlanItems(data || []))
  }, [user])

  const dbSaveBlock = async (block, uid) => {
    const { error } = await supabase.from('day_planner').upsert({
      id: String(block.id),
      user_id: uid,
      plan_date: TODAY,
      event_id: block.eventId ? String(block.eventId) : null,
      plan_item_id: block.planItemId || null,
      title: block.title,
      tab: block.tab || 'general',
      start_time: block.startTime || null,
      duration_mins: Number(block.durationMins) || 60,
      is_free: Boolean(block.isFree),
      is_plan: Boolean(block.isPlan),
    })
    if (error) console.error('day_planner save error:', error.message)
  }

  const dbDeleteBlock = async (id) => {
    const { error } = await supabase.from('day_planner').delete().eq('id', String(id))
    if (error) console.error('day_planner delete error:', error.message)
  }

  const saveBlocks = (blocks, changed = null, action = 'update') => {
    setPlannerBlocks(blocks)
    blocksRef.current = blocks
    if (!user) return
    if (action === 'delete' && changed) dbDeleteBlock(changed)
    else if (changed) dbSaveBlock(changed, user.id)
  }

  const todayEvents = events.filter(e => e.start_date === TODAY)
  const todayLate = sortTasks(todayEvents.filter(isLate))
  const todayPending = sortTasks(todayEvents.filter(e => !isLate(e)))
  const weekDays = Array.from({ length: 6 }, (_, i) => {
    const d = addDays(new Date(), i + 1)
    const ds = format(d, 'yyyy-MM-dd')
    return { dateStr: ds, label: format(d, 'EEEE, MMM d'), evs: sortTasks(events.filter(e => e.start_date === ds)) }
  }).filter(d => d.evs.length > 0)

  const hr = new Date().getHours()
  const greeting = hr < 12 ? 'Good morning' : hr < 17 ? 'Good afternoon' : 'Good evening'
  const planSections = [...new Set(planItems.map(i => i.section))]

  // ---- planner add / edit ----
  const addTaskBlock = (task, startTime) => {
    const nb = {
      id: newBlockId('b'), eventId: task.id, planItemId: null,
      title: task.title, tab: task.tab || 'general',
      startTime: startTime || task.start_time || `${String(Math.min(23, NOW.getHours() + 1)).padStart(2, '0')}:00:00`,
      durationMins: task.duration_minutes || 60, isFree: false, isPlan: false,
    }
    saveBlocks([...blocksRef.current, nb], nb, 'add')
    setOpenDropdown(null)
  }

  const handleDrop = (e) => {
    e.preventDefault()
    const rect = plannerRef.current.getBoundingClientRect()
    const y = e.clientY - rect.top + plannerRef.current.scrollTop
    try {
      const data = JSON.parse(e.dataTransfer.getData('text/plain'))
      const nb = {
        id: newBlockId('b'), eventId: data.id, planItemId: null,
        title: data.title, tab: data.tab || 'general',
        startTime: yToTime(y), durationMins: data.durationMins || 60,
        isFree: false, isPlan: false,
      }
      saveBlocks([...blocksRef.current, nb], nb, 'add')
    } catch { /* ignore bad payload */ }
  }

  const addPlanItem = (item) => {
    const nb = {
      id: newBlockId('p'), eventId: null, planItemId: item.id,
      title: item.text, tab: 'general', startTime: '09:00:00',
      durationMins: 60, isFree: false, isPlan: true,
    }
    saveBlocks([...blocksRef.current, nb], nb, 'add')
    setOpenDropdown(null)
  }

  const addFree = () => {
    const nb = {
      id: newBlockId('f'), eventId: null, planItemId: null,
      title: 'Free time', tab: 'general', startTime: '12:00:00',
      durationMins: 60, isFree: true, isPlan: false,
    }
    saveBlocks([...blocksRef.current, nb], nb, 'add')
  }

  const removeBlock = (id) => saveBlocks(blocksRef.current.filter(b => b.id !== id), id, 'delete')

  // Pointer events => works with both mouse and touch
  const startBlockGesture = (e, blockId, type) => {
    e.preventDefault(); e.stopPropagation()
    const block = blocksRef.current.find(b => b.id === blockId)
    if (!block) return
    const origY = timeToY(block.startTime)
    const origDur = block.durationMins
    const startY = e.clientY
    let latest = block

    const onMove = (me) => {
      const dy = me.clientY - startY
      if (type === 'drag') {
        latest = { ...block, startTime: yToTime(Math.max(0, origY + dy)) }
      } else {
        latest = { ...block, durationMins: Math.max(15, Math.round((origDur + dy / SLOT_H * 15) / 15) * 15) }
      }
      setPlannerBlocks(prev => {
        const next = prev.map(b => (b.id === blockId ? latest : b))
        blocksRef.current = next
        return next
      })
    }
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
      if (user) dbSaveBlock(latest, user.id)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
  }

  const nowY = (NOW.getHours() * 60 + NOW.getMinutes()) / 15 * SLOT_H
  const visibleBlocks = plannerBlocks.filter(b => {
    if (b.isFree || b.isPlan) return true
    return !todayEvents.find(e => e.id === b.eventId)?.completed
  })

  // ---------- panels ----------
  const tasksPanel = (
    <>
      <div className="home-greeting">{greeting}, Jaiveer.</div>
      <div className="home-date">{format(new Date(), 'EEEE · MMMM d, yyyy').toUpperCase()}</div>

      {todayLate.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div className="home-section-label" style={{ color: '#f87171' }}>
            LATE · {todayLate.length} TASK{todayLate.length !== 1 ? 'S' : ''}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {todayLate.map(ev => (
              <LateItem key={ev.id} ev={ev} onToggle={toggleEvent} onDelete={removeEvent}
                onDoToday={async ev => { await supabase.from('events').update({ start_date: TODAY }).eq('id', ev._baseId || ev.id); await reload() }}
                onReschedule={ev => { setRescheduleEv(ev); setRescheduleDate(TODAY) }}
                onEdit={setEditEvent} />
            ))}
          </div>
        </div>
      )}

      <div className="home-section-label">TODAY</div>
      <div className="today-tasks">
        {todayPending.length === 0 && todayLate.length === 0 && <div className="empty-day">Nothing scheduled today — you're clear.</div>}
        {todayPending.length === 0 && todayLate.length > 0 && <div className="empty-day">No more tasks for today.</div>}
        {todayPending.map(ev => (
          <TaskRow key={ev.id} ev={ev} onToggle={toggleEvent} onDelete={removeEvent} onEdit={setEditEvent} />
        ))}
      </div>

      <button className="btn-add" style={{ marginBottom: 20 }} onClick={() => setShowAddModal(true)}>+ Add task for today</button>

      <button className={`week-toggle${weekOpen ? ' open' : ''}`} onClick={() => setWeekOpen(o => !o)}>
        <span>Rest of this week</span>
        {weekDays.length > 0 && <span style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--t-3)', marginLeft: 4 }}>{weekDays.reduce((a, d) => a + d.evs.length, 0)} tasks</span>}
        <span className="week-toggle-chevron">▼</span>
      </button>
      <div className={`week-section${weekOpen ? ' open' : ''}`}>
        {weekDays.length === 0 && <div style={{ padding: '16px 0', color: 'var(--t-3)', fontSize: 13, fontStyle: 'italic' }}>Nothing else this week.</div>}
        {weekDays.map(({ dateStr, label, evs }) => (
          <div key={dateStr} className="week-day-group">
            <div className="week-day-label">{label.toUpperCase()}<span className="week-day-count">{evs.length}</span></div>
            {evs.map(ev => <TaskRow key={ev.id} ev={ev} onToggle={toggleEvent} onDelete={removeEvent} onEdit={setEditEvent} />)}
          </div>
        ))}
      </div>
    </>
  )

  const plannerPanel = (
    <>
      <div className="planner-header">
        <span className="planner-title">DAY PLANNER</span>

        {/* Today's tasks dropdown — tap to add (works on touch) */}
        <div style={{ position: 'relative' }}>
          <button className="btn-ghost planner-chip"
            onClick={() => setOpenDropdown(openDropdown === '__tasks' ? null : '__tasks')}>
            Tasks ▾
          </button>
          {openDropdown === '__tasks' && (
            <div className="planner-dropdown">
              {[...todayLate, ...todayPending].length === 0
                ? <div className="planner-dropdown-empty">No tasks today.</div>
                : [...todayLate, ...todayPending].map(t => (
                  <button key={t.id} className="planner-dropdown-item" onClick={() => addTaskBlock(t)}>
                    {t.priority && <span style={{ color: '#f87171', marginRight: 5 }}>●</span>}{t.title}
                  </button>
                ))}
            </div>
          )}
        </div>

        {planSections.map(section => (
          <div key={section} style={{ position: 'relative' }}>
            <button className="btn-ghost planner-chip" style={{ textTransform: 'capitalize' }}
              onClick={() => setOpenDropdown(openDropdown === section ? null : section)}>
              {section} ▾
            </button>
            {openDropdown === section && (
              <div className="planner-dropdown">
                {planItems.filter(i => i.section === section).length === 0
                  ? <div className="planner-dropdown-empty">Nothing in {section} yet.</div>
                  : planItems.filter(i => i.section === section).map(item => (
                    <button key={item.id} className="planner-dropdown-item" onClick={() => addPlanItem(item)}>{item.text}</button>
                  ))}
              </div>
            )}
          </div>
        ))}

        <button className="btn-ghost planner-chip" onClick={addFree}>+ Free</button>
      </div>

      <div ref={plannerRef} className="planner-scroll"
        onDragOver={e => e.preventDefault()} onDrop={handleDrop}
        onClick={() => setOpenDropdown(null)}>
        <div style={{ height: 24 * HOUR_H, position: 'relative' }}>
          {Array.from({ length: 24 }, (_, h) => (
            <div key={h} style={{ position: 'absolute', left: 0, right: 0, top: h * HOUR_H, height: HOUR_H, boxSizing: 'border-box', borderTop: '1px solid var(--b-1)', pointerEvents: 'none' }}>
              <span style={{ position: 'absolute', left: 6, top: 3, fontFamily: 'var(--f-mono)', fontSize: 9, color: 'var(--t-4)', letterSpacing: '0.04em' }}>
                {h === 0 ? '12 AM' : h < 12 ? `${h} AM` : h === 12 ? '12 PM' : `${h - 12} PM`}
              </span>
              <div style={{ position: 'absolute', left: 36, right: 0, top: HOUR_H / 2, borderTop: '1px dashed var(--b-1)', opacity: 0.4 }} />
            </div>
          ))}

          <div style={{ position: 'absolute', left: 36, right: 0, top: nowY, height: 2, background: 'var(--accent)', pointerEvents: 'none', zIndex: 10 }}>
            <div style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--accent)', marginTop: -2.5, marginLeft: -3.5 }} />
          </div>

          {visibleBlocks.map(block => {
            const y = timeToY(block.startTime)
            const bh = Math.max(SLOT_H, (block.durationMins / 15) * SLOT_H)
            const color = TAB_COLORS[block.tab] || '#2dd4b0'
            return (
              <div key={block.id} className="planner-block"
                style={{
                  top: y, height: bh,
                  background: block.isFree ? 'rgba(255,255,255,0.03)' : `${color}1a`,
                  border: `1.5px solid ${block.isFree ? 'var(--b-2)' : `${color}55`}`,
                }}
                onPointerDown={e => startBlockGesture(e, block.id, 'drag')}>
                <div style={{ fontSize: 10, color: block.isFree ? 'var(--t-3)' : color, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', paddingRight: 14 }}>
                  {block.isPlan && '📋 '}{block.title}
                </div>
                {bh >= 32 && <div style={{ fontSize: 9, color: 'var(--t-4)', fontFamily: 'var(--f-mono)' }}>{block.startTime?.slice(0, 5)} · {block.durationMins}m</div>}
                <button className="planner-block-x"
                  onPointerDown={e => e.stopPropagation()}
                  onClick={e => { e.stopPropagation(); removeBlock(block.id) }}>✕</button>
                <div className="planner-block-resize"
                  onPointerDown={e => { e.stopPropagation(); startBlockGesture(e, block.id, 'resize') }} />
              </div>
            )
          })}
        </div>
      </div>
    </>
  )

  // ---------- layout ----------
  return (
    <div className="home-shell">
      {isMobile ? (
        <>
          <div className="home-switch">
            <button className={mobileView === 'tasks' ? 'active' : ''} onClick={() => setMobileView('tasks')}>Tasks</button>
            <button className={mobileView === 'planner' ? 'active' : ''} onClick={() => setMobileView('planner')}>Planner</button>
          </div>
          {mobileView === 'tasks'
            ? <div className="home-tasks-pane">{tasksPanel}</div>
            : <div className="home-planner-pane">{plannerPanel}</div>}
        </>
      ) : (
        <div className="home-split">
          <div className="home-tasks-pane">{tasksPanel}</div>
          <div className="home-planner-pane">{plannerPanel}</div>
        </div>
      )}

      {showAddModal && <EventModal initialDate={TODAY} onSave={async d => { await addEvent(d); setShowAddModal(false) }} onClose={() => setShowAddModal(false)} />}
      {editEvent && <EventModal initialDate={editEvent.start_date} initialData={editEvent} isEdit
        onSave={async data => {
          await supabase.from('events').update({
            title: data.title, notes: data.notes, start_date: data.start_date,
            start_time: data.start_time || null, duration_minutes: data.duration_minutes || 0,
            recurrence: data.recurrence, recurrence_end: data.recurrence_end || null,
            is_meeting: data.is_meeting, tab: data.tab, priority: data.priority,
          }).eq('id', editEvent._baseId || editEvent.id)
          setEditEvent(null); await reload()
        }} onClose={() => setEditEvent(null)} />}
      {rescheduleEv && (
        <Modal title={`Reschedule "${rescheduleEv.title}"`} onClose={() => setRescheduleEv(null)}>
          <div style={{ fontSize: 12, color: 'var(--t-2)' }}>Pick a new date.</div>
          <input type="date" value={rescheduleDate} min={TODAY} onChange={e => setRescheduleDate(e.target.value)} />
          <div className="modal-actions">
            <button className="btn-ghost" onClick={() => setRescheduleEv(null)}>Cancel</button>
            <button className="btn-primary" onClick={async () => {
              if (!rescheduleDate || !rescheduleEv) return
              await supabase.from('events').update({ start_date: rescheduleDate }).eq('id', rescheduleEv._baseId || rescheduleEv.id)
              setRescheduleEv(null); await reload()
            }}>Reschedule</button>
          </div>
        </Modal>
      )}
    </div>
  )
}

function PriorityBadge() {
  return <span className="priority-badge">PRIORITY</span>
}

function TaskRow({ ev, onToggle, onDelete, onEdit }) {
  const color = TAB_COLORS[ev.tab] || 'var(--t-3)'
  return (
    <div className={`task-item${ev.completed ? ' done' : ''}${ev.priority ? ' priority' : ''}`}
      draggable
      onDragStart={e => e.dataTransfer.setData('text/plain', JSON.stringify({ id: ev.id, title: ev.title, tab: ev.tab, durationMins: ev.duration_minutes || 60 }))}
      onClick={e => { if (!e.target.closest('.task-checkbox') && !e.target.closest('.icon-btn')) onEdit(ev) }}
      style={{ cursor: 'pointer' }}>
      <div className={`task-checkbox${ev.completed ? ' checked' : ''}`} onClick={e => { e.stopPropagation(); onToggle(ev) }} />
      <div className="task-color-bar" style={{ background: ev.priority ? '#f87171' : color }} />
      <div className="task-body">
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <div className="task-title">{ev.title}</div>
          {ev.priority && <PriorityBadge />}
          {ev.is_meeting && <span className="meeting-badge">MEETING</span>}
        </div>
        <div className="task-meta">
          {ev.start_time && <span>{ev.start_time.slice(0, 5)}</span>}
          {ev.duration_minutes > 0 && <span>{ev.duration_minutes >= 60 ? `${Math.floor(ev.duration_minutes / 60)}h${ev.duration_minutes % 60 > 0 ? ` ${ev.duration_minutes % 60}m` : ''}` : `${ev.duration_minutes}m`}</span>}
          <span style={{ color, textTransform: 'capitalize' }}>{ev.tab}</span>
          {ev._recurring && <span className="task-recur-badge">↻ {ev.recurrence}</span>}
        </div>
      </div>
      <div className="task-actions">
        <button className="icon-btn del" onClick={e => { e.stopPropagation(); onDelete(ev) }}>✕</button>
      </div>
    </div>
  )
}

function LateItem({ ev, onToggle, onDelete, onDoToday, onReschedule, onEdit }) {
  const color = TAB_COLORS[ev.tab] || 'var(--t-3)'
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '10px 12px', background: 'rgba(248,113,113,0.05)', border: '1px solid rgba(248,113,113,0.2)', borderRadius: 8, cursor: 'pointer' }}
      onClick={e => { if (!e.target.closest('.task-checkbox') && !e.target.closest('button')) onEdit(ev) }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <div className={`task-checkbox${ev.completed ? ' checked' : ''}`} onClick={e => { e.stopPropagation(); onToggle(ev) }} />
        <div style={{ width: 2.5, borderRadius: 99, background: ev.priority ? '#f87171' : color, alignSelf: 'stretch', minHeight: 16, flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <div style={{ fontSize: 13, color: 'var(--t-1)' }}>{ev.title}</div>
            {ev.priority && <PriorityBadge />}
            <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 99, background: 'rgba(248,113,113,0.15)', color: '#f87171', border: '1px solid rgba(248,113,113,0.3)', fontFamily: 'var(--f-mono)', letterSpacing: '0.08em', flexShrink: 0 }}>LATE</span>
          </div>
          <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--t-3)', marginTop: 3, display: 'flex', gap: 8 }}>
            {ev.start_time && <span>{ev.start_time.slice(0, 5)}</span>}
            <span style={{ color, textTransform: 'capitalize' }}>{ev.tab}</span>
          </div>
        </div>
        <button className="icon-btn del" onClick={e => { e.stopPropagation(); onDelete(ev) }}>✕</button>
      </div>
      <div style={{ display: 'flex', gap: 8, paddingLeft: 26 }}>
        <button onClick={e => { e.stopPropagation(); onDoToday(ev) }} style={{ background: 'var(--bg-3)', border: '1px solid var(--b-2)', color: 'var(--t-2)', fontFamily: 'var(--f-mono)', fontSize: 10, padding: '4px 12px', borderRadius: 6, cursor: 'pointer' }}>DO TODAY</button>
        <button onClick={e => { e.stopPropagation(); onReschedule(ev) }} style={{ background: 'transparent', border: '1px solid var(--b-2)', color: 'var(--t-3)', fontFamily: 'var(--f-mono)', fontSize: 10, padding: '4px 12px', borderRadius: 6, cursor: 'pointer' }}>RESCHEDULE</button>
      </div>
    </div>
  )
}