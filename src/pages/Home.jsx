import { useState, useEffect, useRef, useCallback } from 'react'
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
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:00`
}

export default function Home() {
  const { user } = useAuth()
  const { events, addEvent, toggleEvent, removeEvent, reload } = useEvents('everything')
  const [weekOpen, setWeekOpen] = useState(false)
  const [showAddModal, setShowAddModal] = useState(false)
  const [editEvent, setEditEvent] = useState(null)
  const [rescheduleEv, setRescheduleEv] = useState(null)
  const [rescheduleDate, setRescheduleDate] = useState('')
  const [plannerBlocks, setPlannerBlocks] = useState([])
  const [planItems, setPlanItems] = useState([])
  const [openDropdown, setOpenDropdown] = useState(null)
  const plannerRef = useRef(null)

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

  // Load planner blocks from Supabase
  useEffect(() => {
    if (!user) return
    supabase.from('day_planner').select('*')
      .eq('user_id', user.id).eq('plan_date', TODAY)
      .order('created_at')
      .then(({ data }) => {
        if (data) setPlannerBlocks(data.map(r => ({
          id: r.id, eventId: r.event_id, planItemId: r.plan_item_id,
          title: r.title, tab: r.tab, startTime: r.start_time,
          durationMins: r.duration_mins, isFree: r.is_free, isPlan: r.is_plan
        })))
      })
  }, [user])

  // Load plan items
  useEffect(() => {
    if (!user) return
    supabase.from('plan_items').select('*').eq('user_id', user.id).order('created_at')
      .then(({ data }) => setPlanItems(data || []))
  }, [user])

  const saveBlocks = useCallback(async (blocks, changedBlock = null, action = 'update') => {
    setPlannerBlocks(blocks)
    if (!user) return
    if (action === 'add' && changedBlock) {
      const { error } = await supabase.from('day_planner').insert({
        id: changedBlock.id, user_id: user.id, plan_date: TODAY,
        event_id: changedBlock.eventId || null,
        plan_item_id: changedBlock.planItemId || null,
        title: changedBlock.title, tab: changedBlock.tab,
        start_time: changedBlock.startTime,
        duration_mins: changedBlock.durationMins,
        is_free: changedBlock.isFree, is_plan: changedBlock.isPlan
      })
      if (error) console.error('day_planner insert error:', error)
    } else if (action === 'delete' && changedBlock) {
      await supabase.from('day_planner').delete().eq('id', changedBlock)
    } else if (action === 'update' && changedBlock) {
      await supabase.from('day_planner').update({
        start_time: changedBlock.startTime,
        duration_mins: changedBlock.durationMins
      }).eq('id', changedBlock.id)
    }
  }, [user])

  const todayEvents = events.filter(e => e.start_date === TODAY)
  const todayLate = todayEvents.filter(isLate)
  const todayPending = todayEvents.filter(e => !isLate(e))
  const weekDays = Array.from({ length: 6 }, (_, i) => {
    const d = addDays(new Date(), i + 1)
    const ds = format(d, 'yyyy-MM-dd')
    return { dateStr: ds, label: format(d, 'EEEE, MMM d'), evs: events.filter(e => e.start_date === ds) }
  }).filter(d => d.evs.length > 0)

  const greeting = new Date().getHours() < 12 ? 'Good morning' : new Date().getHours() < 17 ? 'Good afternoon' : 'Good evening'
  const planSections = [...new Set(planItems.map(i => i.section))]

  // Planner handlers
  const handleDrop = (e) => {
    e.preventDefault()
    const rect = plannerRef.current.getBoundingClientRect()
    const y = e.clientY - rect.top + plannerRef.current.scrollTop
    try {
      const data = JSON.parse(e.dataTransfer.getData('text/plain'))
      if (plannerBlocks.find(b => b.eventId === data.id)) return
      const nb = { id: `b_${Date.now()}`, eventId: data.id, planItemId: null, title: data.title, tab: data.tab || 'general', startTime: yToTime(y), durationMins: data.durationMins || 60, isFree: false, isPlan: false }
      saveBlocks([...plannerBlocks, nb], nb, 'add')
    } catch {}
  }

  const addPlanItem = (item) => {
    if (plannerBlocks.find(b => b.planItemId === item.id)) return
    const nb = { id: `p_${Date.now()}`, eventId: null, planItemId: item.id, title: item.text, tab: 'general', startTime: '09:00:00', durationMins: 60, isFree: false, isPlan: true }
    saveBlocks([...plannerBlocks, nb], nb, 'add')
    setOpenDropdown(null)
  }

  const addFree = () => { const nb = { id: `f_${Date.now()}`, eventId: null, planItemId: null, title: 'Free time', tab: 'general', startTime: '12:00:00', durationMins: 60, isFree: true, isPlan: false }; saveBlocks([...plannerBlocks, nb], nb, 'add') }

  const removeBlock = (id) => saveBlocks(plannerBlocks.filter(b => b.id !== id), id, 'delete')

  const handleBlockMouseDown = (e, blockId, type) => {
    e.preventDefault(); e.stopPropagation()
    const block = plannerBlocks.find(b => b.id === blockId)
    const origY = timeToY(block.startTime)
    const origDur = block.durationMins
    const startY = e.clientY
    const onMove = (me) => {
      const dy = me.clientY - startY
      if (type === 'drag') {
        const updated = { ...block, startTime: yToTime(Math.max(0, origY + dy)) }
        saveBlocks(plannerBlocks.map(b => b.id === blockId ? updated : b), updated, 'update')
      } else {
        const newDur = Math.max(15, Math.round((origDur + dy / SLOT_H * 15) / 15) * 15)
        const updated = { ...block, durationMins: newDur }
        saveBlocks(plannerBlocks.map(b => b.id === blockId ? updated : b), updated, 'update')
      }
    }
    const onUp = () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  const nowY = (NOW.getHours() * 60 + NOW.getMinutes()) / 15 * SLOT_H
  const visibleBlocks = plannerBlocks.filter(b => {
    if (b.isFree || b.isPlan) return true
    return !todayEvents.find(e => e.id === b.eventId)?.completed
  })

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>

      {/* LEFT 50% — todo list */}
      <div style={{ flex: '0 0 50%', borderRight: '1px solid var(--b-1)', overflowY: 'auto', padding: '36px 32px' }}>
        <div className="home-greeting">{greeting}, Jaiveer.</div>
        <div className="home-date">{format(new Date(), 'EEEE · MMMM d, yyyy').toUpperCase()}</div>

        {todayLate.length > 0 && (
          <div style={{ marginBottom: 24 }}>
            <div className="home-section-label" style={{ color: '#f87171' }}>LATE · {todayLate.length} TASK{todayLate.length !== 1 ? 'S' : ''}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {todayLate.map(ev => (
                <LateItem key={ev.id} ev={ev} onToggle={toggleEvent} onDelete={removeEvent}
                  onDoToday={async ev => { await supabase.from('events').update({ start_date: TODAY }).eq('id', ev._baseId || ev.id); await reload() }}
                  onReschedule={ev => { setRescheduleEv(ev); setRescheduleDate(TODAY) }}
                  onEdit={setEditEvent}
                />
              ))}
            </div>
          </div>
        )}

        <div className="home-section-label">TODAY</div>
        <div className="today-tasks">
          {todayPending.length === 0 && todayLate.length === 0 && <div className="empty-day">Nothing scheduled today — you're clear.</div>}
          {todayPending.length === 0 && todayLate.length > 0 && <div className="empty-day">No more tasks for today.</div>}
          {todayPending.map(ev => <TaskRow key={ev.id} ev={ev} onToggle={toggleEvent} onDelete={removeEvent} onEdit={setEditEvent} />)}
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
      </div>

      {/* RIGHT 50% — day planner */}
      <div style={{ flex: '0 0 50%', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--bg-2)' }}>
        <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--b-1)', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, flexWrap: 'wrap' }}>
          <span style={{ fontFamily: 'var(--f-mono)', fontSize: 10, letterSpacing: '0.1em', color: 'var(--t-3)', flex: 1 }}>DAY PLANNER</span>
          {planSections.map(section => (
            <div key={section} style={{ position: 'relative' }}>
              <button className="btn-ghost" style={{ fontSize: 10, padding: '4px 10px', textTransform: 'capitalize' }}
                onClick={() => setOpenDropdown(openDropdown === section ? null : section)}>
                {section} ▾
              </button>
              {openDropdown === section && (
                <div style={{ position: 'absolute', top: '100%', right: 0, zIndex: 200, background: 'var(--bg-modal)', border: '1px solid var(--b-2)', borderRadius: 8, minWidth: 200, marginTop: 4, boxShadow: '0 8px 32px rgba(0,0,0,0.4)', overflow: 'hidden' }}>
                  {planItems.filter(i => i.section === section).length === 0
                    ? <div style={{ padding: '10px 14px', fontSize: 11, color: 'var(--t-3)', fontStyle: 'italic' }}>Nothing in {section} yet.</div>
                    : planItems.filter(i => i.section === section).map(item => (
                      <button key={item.id} onClick={() => addPlanItem(item)} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '9px 14px', background: 'none', border: 'none', borderBottom: '1px solid var(--b-1)', color: 'var(--t-1)', fontSize: 12, cursor: 'pointer' }}
                        onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-3)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'none'}>
                        {item.text}
                      </button>
                    ))
                  }
                </div>
              )}
            </div>
          ))}
          <button className="btn-ghost" style={{ fontSize: 10, padding: '4px 10px' }} onClick={addFree}>+ Free time</button>
        </div>

        <div ref={plannerRef} style={{ flex: 1, overflowY: 'auto', position: 'relative' }}
          onDragOver={e => e.preventDefault()} onDrop={handleDrop}
          onClick={() => setOpenDropdown(null)}>
          <div style={{ height: 24 * HOUR_H, position: 'relative' }}>
            {/* Hour rows */}
            {Array.from({ length: 24 }, (_, h) => (
              <div key={h} style={{ position: 'absolute', left: 0, right: 0, top: h * HOUR_H, height: HOUR_H, boxSizing: 'border-box', borderTop: '1px solid var(--b-1)', pointerEvents: 'none' }}>
                <span style={{ position: 'absolute', left: 6, top: 3, fontFamily: 'var(--f-mono)', fontSize: 9, color: 'var(--t-4)', letterSpacing: '0.04em' }}>
                  {h === 0 ? '12 AM' : h < 12 ? `${h} AM` : h === 12 ? '12 PM' : `${h-12} PM`}
                </span>
                {/* 30-min dashed line */}
                <div style={{ position: 'absolute', left: 36, right: 0, top: HOUR_H / 2, borderTop: '1px dashed var(--b-1)', opacity: 0.4 }} />
              </div>
            ))}

            {/* Now line */}
            <div style={{ position: 'absolute', left: 36, right: 0, top: nowY, height: 2, background: 'var(--accent)', pointerEvents: 'none', zIndex: 10 }}>
              <div style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--accent)', marginTop: -2.5, marginLeft: -3.5 }} />
            </div>

            {/* Blocks */}
            {visibleBlocks.map(block => {
              const y = timeToY(block.startTime)
              const bh = Math.max(SLOT_H, (block.durationMins / 15) * SLOT_H)
              const color = TAB_COLORS[block.tab] || '#2dd4b0'
              return (
                <div key={block.id} style={{ position: 'absolute', left: 40, right: 6, top: y, height: bh, background: block.isFree ? 'rgba(255,255,255,0.03)' : `${color}1a`, border: `1.5px solid ${block.isFree ? 'var(--b-2)' : `${color}55`}`, borderRadius: 6, padding: '3px 8px 10px', cursor: 'grab', userSelect: 'none', zIndex: 5, overflow: 'hidden', boxSizing: 'border-box' }}
                  onMouseDown={e => handleBlockMouseDown(e, block.id, 'drag')}>
                  <div style={{ fontSize: 10, color: block.isFree ? 'var(--t-3)' : color, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {block.isPlan && '📋 '}{block.title}
                  </div>
                  {bh >= 32 && <div style={{ fontSize: 9, color: 'var(--t-4)', fontFamily: 'var(--f-mono)' }}>{block.startTime?.slice(0,5)} · {block.durationMins}m</div>}
                  <button style={{ position: 'absolute', top: 2, right: 4, background: 'none', border: 'none', color: 'var(--t-4)', cursor: 'pointer', fontSize: 10, padding: 0 }}
                    onMouseDown={e => e.stopPropagation()} onClick={e => { e.stopPropagation(); removeBlock(block.id) }}>✕</button>
                  <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 8, cursor: 'ns-resize' }}
                    onMouseDown={e => { e.stopPropagation(); handleBlockMouseDown(e, block.id, 'resize') }} />
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Modals */}
      {showAddModal && <EventModal initialDate={TODAY} onSave={async d => { await addEvent(d); setShowAddModal(false) }} onClose={() => setShowAddModal(false)} />}
      {editEvent && <EventModal initialDate={editEvent.start_date} initialData={editEvent} isEdit
        onSave={async data => {
          await supabase.from('events').update({ title: data.title, notes: data.notes, start_date: data.start_date, start_time: data.start_time || null, duration_minutes: data.duration_minutes || 0, recurrence: data.recurrence, recurrence_end: data.recurrence_end || null, is_meeting: data.is_meeting, tab: data.tab }).eq('id', editEvent._baseId || editEvent.id)
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

function TaskRow({ ev, onToggle, onDelete, onEdit }) {
  const color = TAB_COLORS[ev.tab] || 'var(--t-3)'
  return (
    <div className={`task-item${ev.completed ? ' done' : ''}`}
      draggable
      onDragStart={e => e.dataTransfer.setData('text/plain', JSON.stringify({ id: ev.id, title: ev.title, tab: ev.tab, durationMins: ev.duration_minutes || 60 }))}
      onClick={e => { if (!e.target.closest('.task-checkbox') && !e.target.closest('.icon-btn')) onEdit(ev) }}
      style={{ cursor: 'pointer' }}>
      <div className={`task-checkbox${ev.completed ? ' checked' : ''}`} onClick={e => { e.stopPropagation(); onToggle(ev) }} />
      <div className="task-color-bar" style={{ background: color }} />
      <div className="task-body">
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div className="task-title">{ev.title}</div>
          {ev.is_meeting && <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 99, background: 'rgba(96,165,250,0.12)', color: '#60a5fa', border: '1px solid rgba(96,165,250,0.2)', fontFamily: 'var(--f-mono)', letterSpacing: '0.06em', flexShrink: 0 }}>MEETING</span>}
        </div>
        <div className="task-meta">
          {ev.start_time && <span>{ev.start_time.slice(0,5)}</span>}
          {ev.duration_minutes > 0 && <span>{ev.duration_minutes >= 60 ? `${Math.floor(ev.duration_minutes/60)}h${ev.duration_minutes%60>0?` ${ev.duration_minutes%60}m`:''}` : `${ev.duration_minutes}m`}</span>}
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
        <div style={{ width: 2.5, borderRadius: 99, background: color, alignSelf: 'stretch', minHeight: 16, flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ fontSize: 13, color: 'var(--t-1)' }}>{ev.title}</div>
            <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 99, background: 'rgba(248,113,113,0.15)', color: '#f87171', border: '1px solid rgba(248,113,113,0.3)', fontFamily: 'var(--f-mono)', letterSpacing: '0.08em', flexShrink: 0 }}>LATE</span>
          </div>
          <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--t-3)', marginTop: 3, display: 'flex', gap: 8 }}>
            {ev.start_time && <span>{ev.start_time.slice(0,5)}</span>}
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