import { useState, useEffect } from 'react'
import {
  format, startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  addDays, addMonths, subMonths, isSameMonth, isToday, parseISO
} from 'date-fns'
import { useEvents } from '../lib/useEvents'
import { useAuth } from '../lib/AuthContext'
import { supabase } from '../lib/supabase'
import TaskItem from '../components/TaskItem'
import EventModal from '../components/EventModal'
import Modal from '../components/Modal'


export default function College() {
  const { user } = useAuth()
  const { events, addEvent, toggleEvent, removeEvent, reload } = useEvents('college')
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [selectedDate, setSelectedDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [showEventModal, setShowEventModal] = useState(false)
  const [editEvent, setEditEvent] = useState(null)


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
  const sortP = (a) => [...a].sort((x, y) => (y.priority ? 1 : 0) - (x.priority ? 1 : 0))
  const pending = sortP(selectedEvents.filter(e => !e.completed))
  const done = selectedEvents.filter(e => e.completed)

  return (
    <div className="college-layout">
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
            {pending.map(ev => <TaskItem key={ev.id} event={ev} onToggle={toggleEvent} onDelete={removeEvent} onEdit={setEditEvent} />)}
            {done.length > 0 && (
              <>
                <div style={{ fontSize: 10, fontFamily: 'var(--f-mono)', color: 'var(--t-4)', letterSpacing: '0.1em', margin: '8px 0 4px' }}>COMPLETED</div>
                {done.map(ev => <TaskItem key={ev.id} event={ev} onToggle={toggleEvent} onDelete={removeEvent} onEdit={setEditEvent} />)}
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

      {showEventModal && (
        <EventModal
          initialDate={selectedDate}
          forcedTab="college"
          onSave={async (d) => { await addEvent(d); setShowEventModal(false) }}
          onClose={() => setShowEventModal(false)}
        />
      )}

      {editEvent && (
        <EventModal
          initialDate={editEvent.start_date}
          initialData={editEvent}
          isEdit
          onSave={async (data) => {
            await supabase.from('events').update({
              title: data.title, notes: data.notes, start_date: data.start_date,
              start_time: data.start_time || null, duration_minutes: data.duration_minutes || 0,
              recurrence: data.recurrence, recurrence_end: data.recurrence_end || null,
              is_meeting: data.is_meeting, tab: data.tab, priority: data.priority,
            }).eq('id', editEvent._baseId || editEvent.id)
            setEditEvent(null)
            await reload()
          }}
          onClose={() => setEditEvent(null)}
        />
      )}

    </div>
  )
}