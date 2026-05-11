import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../lib/AuthContext'
import { getEvents, createEvent, updateEvent, deleteEvent } from '../lib/db'
import { addDays, addWeeks, addMonths, format, parseISO, isAfter, isBefore } from 'date-fns'

function expandRecurring(events) {
  const expanded = []
  const today = new Date()
  const cutoff = addMonths(today, 6)

  for (const ev of events) {
    // For recurring events, don't push the base event itself
    // (its start_date is in the past). Only push instances.
    if (ev.recurrence !== 'none' && ev.start_date) {
      let cur = parseISO(ev.start_date)
      const end = ev.recurrence_end ? parseISO(ev.recurrence_end) : cutoff
      let i = 0

      // Include the base date if it's today or future
      if (!isBefore(cur, today) || format(cur, 'yyyy-MM-dd') === format(today, 'yyyy-MM-dd')) {
        expanded.push({ ...ev, _isRecurringInstance: false })
      }

      for (let j = 1; j <= 365; j++) {
        if (ev.recurrence === 'daily')   cur = addDays(cur, 1)
        if (ev.recurrence === 'weekly')  cur = addWeeks(cur, 1)
        if (ev.recurrence === 'monthly') cur = addMonths(cur, 1)
        if (isAfter(cur, end) || isAfter(cur, cutoff)) break

        const dateStr = format(cur, 'yyyy-MM-dd')
        expanded.push({
          ...ev,
          id: `${ev.id}_r${j}`,
          start_date: dateStr,
          _isRecurringInstance: true,
          _baseId: ev.id,
        })
      }
    } else {
      expanded.push(ev)
    }
  }
  return expanded
}

export function useEvents(tab) {
  const { user } = useAuth()
  const [rawEvents, setRawEvents] = useState([])
  const [completedInstances, setCompletedInstances] = useState(new Set()) // "baseId_date"
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

  const events = expandRecurring(filtered).filter(ev => {
    // Hide instances that have been checked off (tracked in local state)
    if (ev._isRecurringInstance) {
      return !completedInstances.has(`${ev._baseId}_${ev.start_date}`)
    }
    return true
  })

  const addEvent = async (data) => {
    const created = await createEvent(user.id, data)
    setRawEvents(prev => [...prev, created])
    return created
  }

  const toggleEvent = async (ev) => {
    if (ev._isRecurringInstance) {
      // For recurring instances: just toggle local state
      // Don't touch the base event in the database
      const key = `${ev._baseId}_${ev.start_date}`
      setCompletedInstances(prev => {
        const next = new Set(prev)
        if (next.has(key)) {
          next.delete(key)
        } else {
          next.add(key)
        }
        return next
      })
      return
    }

    // Non-recurring event: toggle normally in DB
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