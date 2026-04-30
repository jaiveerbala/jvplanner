import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../lib/AuthContext'
import { getEvents, createEvent, updateEvent, deleteEvent } from '../lib/db'
import { addDays, addWeeks, addMonths, format, parseISO, isAfter } from 'date-fns'

function expandRecurring(events) {
  const expanded = []
  const today = new Date()
  const cutoff = addMonths(today, 6)

  for (const ev of events) {
    expanded.push(ev)
    if (ev.recurrence === 'none' || !ev.start_date) continue

    let cur = parseISO(ev.start_date)
    const end = ev.recurrence_end ? parseISO(ev.recurrence_end) : cutoff

    for (let i = 1; i <= 180; i++) {
      if (ev.recurrence === 'daily')   cur = addDays(cur, 1)
      if (ev.recurrence === 'weekly')  cur = addWeeks(cur, 1)
      if (ev.recurrence === 'monthly') cur = addMonths(cur, 1)
      if (isAfter(cur, end)) break

      expanded.push({
        ...ev,
        id: `${ev.id}_r${i}`,
        start_date: format(cur, 'yyyy-MM-dd'),
        _isRecurringInstance: true,
        _baseId: ev.id,
      })
    }
  }
  return expanded
}

export function useEvents(tab) {
  const { user } = useAuth()
  const [rawEvents, setRawEvents] = useState([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!user) return
    setLoading(true)
    const data = await getEvents(user.id)
    setRawEvents(data)
    setLoading(false)
  }, [user])

  useEffect(() => { load() }, [load])

  // COMPLETED TAB
  if (tab === 'completed') {
    const completed = [...rawEvents]
      .filter(e => e.completed)
      .sort((a, b) => new Date(b.completed_at || b.created_at) - new Date(a.completed_at || a.created_at))

    const restoreEvent = async (ev) => {
      const updated = await updateEvent(ev.id, { completed: false, completed_at: null })
      setRawEvents(prev => prev.map(e => e.id === ev.id ? updated : e))
    }

    const removeEvent = async (ev) => {
      await deleteEvent(ev.id)
      setRawEvents(prev => prev.filter(e => e.id !== ev.id))
    }

    return { events: completed, rawEvents, loading, restoreEvent, removeEvent, reload: load }
  }

  // ACTIVE TABS — exclude completed AND past events from calendars/lists
  const todayStr = new Date().toISOString().slice(0, 10)
  const activeRaw = rawEvents.filter(e => !e.completed)

  const filtered = tab === 'everything'
    ? activeRaw
    : activeRaw.filter(e => e.tab === tab)

  const events = expandRecurring(filtered)

  const addEvent = async (data) => {
    const created = await createEvent(user.id, data)
    setRawEvents(prev => [...prev, created])
    return created
  }

  const toggleEvent = async (ev) => {
    const id = ev._baseId || ev.id
    const base = rawEvents.find(e => e.id === id)
    if (!base) return
    const nowCompleted = !base.completed
    const updated = await updateEvent(id, {
      completed: nowCompleted,
      completed_at: nowCompleted ? new Date().toISOString() : null,
    })
    setRawEvents(prev => prev.map(e => e.id === id ? updated : e))
  }

  const removeEvent = async (ev) => {
    const id = ev._baseId || ev.id
    await deleteEvent(id)
    setRawEvents(prev => prev.filter(e => e.id !== id))
  }

  return { events, rawEvents, loading, addEvent, toggleEvent, removeEvent, reload: load }
}
