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

  // ACTIVE TABS — exclude completed from calendars/lists
  const activeRaw = rawEvents.filter(e => !e.completed)

  const filtered = tab === 'everything'
    ? activeRaw
    : activeRaw.filter(e => e.tab === tab)

  // Also get completed recurring instances so we can hide them
  const completedInstanceDates = new Set(
    rawEvents
      .filter(e => e.completed && e._recurringInstanceDate)
      .map(e => `${e._baseRecurringId}_${e._recurringInstanceDate}`)
  )

  const events = expandRecurring(filtered).filter(ev => {
    if (!ev._isRecurringInstance) return true
    return !completedInstanceDates.has(`${ev._baseId}_${ev.start_date}`)
  })

  const addEvent = async (data) => {
    const created = await createEvent(user.id, data)
    setRawEvents(prev => [...prev, created])
    return created
  }

  const toggleEvent = async (ev) => {
    if (ev._isRecurringInstance) {
      // For recurring instances: create a completed one-time record for just this day
      // Don't touch the base event at all
      const alreadyDone = rawEvents.find(e =>
        e._baseRecurringId === ev._baseId &&
        e._recurringInstanceDate === ev.start_date &&
        e.completed
      )

      if (alreadyDone) {
        // Undo — delete the completion record
        await deleteEvent(alreadyDone.id)
        setRawEvents(prev => prev.filter(e => e.id !== alreadyDone.id))
      } else {
        // Mark this specific instance as done by creating a completed copy
        const base = rawEvents.find(e => e.id === ev._baseId)
        if (!base) return
        const created = await createEvent(user.id, {
          ...base,
          id: undefined,
          start_date: ev.start_date,
          recurrence: 'none',
          recurrence_end: null,
          completed: true,
          completed_at: new Date().toISOString(),
          _baseRecurringId: ev._baseId,
          _recurringInstanceDate: ev.start_date,
        })
        setRawEvents(prev => [...prev, created])
      }
      return
    }

    // Non-recurring: toggle normally
    const base = rawEvents.find(e => e.id === ev.id)
    if (!base) return
    const nowCompleted = !base.completed
    const updated = await updateEvent(ev.id, {
      completed: nowCompleted,
      completed_at: nowCompleted ? new Date().toISOString() : null,
    })
    setRawEvents(prev => prev.map(e => e.id === ev.id ? updated : e))
  }

  const removeEvent = async (ev) => {
    const id = ev._baseId || ev.id
    await deleteEvent(id)
    setRawEvents(prev => prev.filter(e => e.id !== id))
  }

  return { events, rawEvents, loading, addEvent, toggleEvent, removeEvent, reload: load }
}