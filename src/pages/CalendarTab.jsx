import { useState, useEffect } from 'react'
import {
  format, startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  addDays, addMonths, subMonths, isSameMonth, isToday, parseISO
} from 'date-fns'
import { useEvents } from '../lib/useEvents'
import { useAuth } from '../lib/AuthContext'
import TaskItem from '../components/TaskItem'
import EventModal from '../components/EventModal'
import Modal from '../components/Modal'

const TAB_COLORS = { general: '#60a5fa', school: '#c084fc', college: '#f59e0b' }

export default function CalendarTab({ tab }) {
  const { user } = useAuth()
  const { events, rawEvents, addEvent, toggleEvent, removeEvent, reload } = useEvents(tab)
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [selectedDate, setSelectedDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [showEventModal, setShowEventModal] = useState(false)
  const [showCanvasModal, setShowCanvasModal] = useState(false)
  const [canvasUrl, setCanvasUrl] = useState(() => localStorage.getItem('canvas_ics') || '')
  const [canvasStatus, setCanvasStatus] = useState('')
  const [importing, setImporting] = useState(false)

  // Auto-sync Canvas every time School tab opens
  useEffect(() => {
    if (tab !== 'school') return
    const savedUrl = localStorage.getItem('canvas_ics')
    if (!savedUrl) return
    ;(async () => {
      try {
        const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
        const res = await fetch(`${SUPABASE_URL}/functions/v1/canvas-sync`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ icsUrl: savedUrl, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone })
        })
        const json = await res.json()
        if (json.error || !json.events) return

        const todayStr = format(new Date(), 'yyyy-MM-dd')

        // Get IDs of Canvas events the user has already completed in the app
        // We never touch these — user's completion is final
        const completedCanvasTitles = new Set(
          rawEvents
            .filter(e => e.source === 'canvas' && e.completed)
            .map(e => e.title)
        )

        // Delete all INCOMPLETE Canvas events so we can re-import fresh
        // This handles due date changes, removed assignments, etc.
        const incompleteCanvasIds = rawEvents
          .filter(e => e.source === 'canvas' && !e.completed)
          .map(e => e._baseId || e.id)
          .filter((id, i, arr) => arr.indexOf(id) === i) // dedupe

        for (const id of incompleteCanvasIds) {
          try {
            const { supabase } = await import('../lib/supabase')
            await supabase.from('events').delete().eq('id', id)
          } catch {}
        }

        // Re-import all Canvas events
        const { createEvent: addEv } = await import('../lib/db')
        const { supabase } = await import('../lib/supabase')
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return

        for (const ev of json.events) {
          // Skip if user already completed this assignment
          if (completedCanvasTitles.has(ev.title)) continue
          // Skip past assignments
          if (ev.start_date && ev.start_date < todayStr) continue
          await addEv(user.id, { ...ev, completed: false })
        }

        await reload()
      } catch (e) {
        console.error('Canvas sync error:', e)
      }
    })()
  }, [tab])

  // Calendar grid
  const monthStart = startOfMonth(currentMonth)
  const monthEnd = endOfMonth(currentMonth)
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 0 })
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 0 })
  const days = []
  let cur = gridStart
  while (cur <= gridEnd) { days.push(cur); cur = addDays(cur, 1) }

  const todayStr = format(new Date(), 'yyyy-MM-dd')
  // Side panel: show all events for selected date
  const getForDate = (ds) => events.filter(e => e.start_date === ds)
  // Calendar grid: hide past dates entirely
  const getForDateCalendar = (ds) => ds < todayStr ? [] : events.filter(e => e.start_date === ds && !e.completed)

  const selectedEvents = getForDate(selectedDate)
  const pending = selectedEvents.filter(e => !e.completed)
  const done = selectedEvents.filter(e => e.completed)

  const handleCanvasImport = async () => {
    if (!canvasUrl.trim()) return
    setImporting(true)
    setCanvasStatus('Syncing Canvas...')
    try {
      const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
      const res = await fetch(`${SUPABASE_URL}/functions/v1/canvas-sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ icsUrl: canvasUrl, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone })
      })
      const json = await res.json()
      if (json.error) throw new Error(json.error)
      localStorage.setItem('canvas_ics', canvasUrl)
      // Save URL to Supabase so server-side sync can use it
      const { data: { user: u } } = await supabase.auth.getUser()
      if (u) {
        await supabase.from('user_settings').upsert({ user_id: u.id, canvas_ics_url: canvasUrl, updated_at: new Date().toISOString() })
      }

      const todayStr = format(new Date(), 'yyyy-MM-dd')
      const completedCanvasTitles = new Set(
        rawEvents.filter(e => e.source === 'canvas' && e.completed).map(e => e.title)
      )

      // Delete all incomplete Canvas events
      const { supabase } = await import('../lib/supabase')
      const incompleteIds = rawEvents
        .filter(e => e.source === 'canvas' && !e.completed)
        .map(e => e._baseId || e.id)
        .filter((id, i, arr) => arr.indexOf(id) === i)
      for (const id of incompleteIds) {
        await supabase.from('events').delete().eq('id', id)
      }

      // Re-import fresh
      const { createEvent: addEv } = await import('../lib/db')
      const { data: { user } } = await supabase.auth.getUser()
      let added = 0
      for (const ev of json.events) {
        if (completedCanvasTitles.has(ev.title)) continue
        if (ev.start_date && ev.start_date < todayStr) continue
        await addEv(user.id, { ...ev, completed: false })
        added++
      }

      await reload()
      setCanvasStatus(`✓ Synced — ${added} upcoming assignments`)
    } catch (err) {
      setCanvasStatus(`Error — ${err.message}`)
    }
    setImporting(false)
  }

  return (
    <div className="tab-layout">
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
            {tab === 'everything' && (
              <div className="cal-legend">
                <span className="legend-pip" style={{ background: '#60a5fa' }} /> General
                <span className="legend-pip" style={{ background: '#c084fc', marginLeft: 4 }} /> School
                <span className="legend-pip" style={{ background: '#f59e0b', marginLeft: 4 }} /> College
              </div>
            )}
            {tab === 'school' && (
              <button className="btn-ghost" style={{ fontSize: 11 }} onClick={() => setShowCanvasModal(true)}>
                ↓ Canvas Import
              </button>
            )}
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
              const isSelected = ds === selectedDate
              return (
                <div
                  key={ds}
                  className={['cal-cell', isToday(day) ? 'today' : '', !isSameMonth(day, currentMonth) ? 'other-month' : '', isSelected ? 'selected' : ''].join(' ')}
                  onClick={() => setSelectedDate(ds)}
                  style={isSelected ? { background: 'var(--accent-glow)' } : {}}
                >
                  <div className="cal-cell-num">{format(day, 'd')}</div>
                  <div className="cal-cell-events">
                    {dayEvents.slice(0, 3).map((ev, i) => (
                      <div key={i} className={`cal-chip${tab === 'everything' ? ` ${ev.tab}` : ''}`}
                        style={tab !== 'everything' ? { background: `${TAB_COLORS[ev.tab]}22`, color: TAB_COLORS[ev.tab] } : {}}>
                        {ev.title}
                      </div>
                    ))}
                    {dayEvents.length > 3 && <div className="cal-overflow">+{dayEvents.length - 3} more</div>}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      <div className="side-panel">
        <div className="side-panel-header">
          <div className="side-panel-date">{format(parseISO(selectedDate), 'EEEE, MMMM d')}</div>
          <div className="side-panel-sub">
            {selectedEvents.length === 0 ? 'Nothing scheduled' : `${pending.length} pending · ${done.length} done`}
          </div>
        </div>
        <div className="side-panel-body">
          {selectedEvents.length === 0 && <div className="side-panel-empty">Nothing on this day.</div>}
          {pending.map(ev => (
            <TaskItem key={ev.id} event={ev} onToggle={toggleEvent} onDelete={removeEvent} showTab={tab === 'everything'} />
          ))}
          {done.length > 0 && (
            <>
              <div style={{ fontSize: 10, fontFamily: 'var(--f-mono)', color: 'var(--t-4)', letterSpacing: '0.1em', margin: '8px 0 4px' }}>COMPLETED</div>
              {done.map(ev => (
                <TaskItem key={ev.id} event={ev} onToggle={toggleEvent} onDelete={removeEvent} showTab={tab === 'everything'} />
              ))}
            </>
          )}
        </div>
        <div className="side-panel-footer">
          <button className="btn-add" onClick={() => setShowEventModal(true)}>
            + Add task on {format(parseISO(selectedDate), 'MMM d')}
          </button>
        </div>
      </div>

      {showEventModal && (
        <EventModal
          initialDate={selectedDate}
          forcedTab={tab === 'everything' ? null : tab}
          onSave={async (d) => { await addEvent(d); setShowEventModal(false) }}
          onClose={() => setShowEventModal(false)}
        />
      )}

      {showCanvasModal && (
        <Modal title="Canvas ICS Import" onClose={() => setShowCanvasModal(false)}>
          <div style={{ fontSize: 12, color: 'var(--t-2)', lineHeight: 1.6 }}>
            Paste your Canvas Calendar Feed URL below.
          </div>
          <input type="url" placeholder="https://sjusd.instructure.com/feeds/calendars/..."
            value={canvasUrl} onChange={e => setCanvasUrl(e.target.value)} />
          {canvasStatus && (
            <div style={{ fontSize: 11, color: canvasStatus.startsWith('✓') ? '#2dd4b0' : '#f87171', fontFamily: 'var(--f-mono)' }}>
              {canvasStatus}
            </div>
          )}
          <div className="modal-actions">
            <button className="btn-ghost" onClick={() => setShowCanvasModal(false)}>Close</button>
            <button className="btn-primary" onClick={handleCanvasImport} disabled={importing}>
              {importing ? 'Importing...' : 'Import'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}