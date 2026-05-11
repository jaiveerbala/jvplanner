import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../lib/AuthContext'
import { getEvents, createEvent, updateEvent, deleteEvent } from '../lib/db'
import { addDays, addWeeks, addMonths, format, parseISO, isAfter, isBefore, startOfDay } from 'date-fns'

function expandRecurring(events) {
  const expanded = []
  const today = startOfDay(new Date())
  const cutoff = addMonths(today, 6)

  for (const ev of events) {
    if (ev.recurrence === 'none' || !ev.start_date) {
      expanded.push(ev)
      continue
    }

    // For recurring events, expand ALL instances from start_date
    // treating every occurrence as an instance (including the first)
    let cur = parseISO(ev.start_date)
    const end = ev.recurrence_end ? parseISO(ev.recurrence_end) : cutoff
    let instanceNum = 0

    while (!isAfter(cur, end) && !isAfter(cur, cutoff)) {
      const dateStr = format(cur, 'yyyy-MM-dd')
      expanded.push({
        ...ev,
        id: `${ev.id}_r${instanceNum}`,
        start_date: dateStr,
        _isRecurringInstance: true,
        _baseId: ev.id,
      })
      instanceNum++
      if (instanceNum > 365) break
      if (ev.recurrence === 'daily')   cur = addDays(cur, 1)
      else if (ev.recurrence === 'weekly')  cur = addWeeks(cur, 1)
      else if (ev.recurrence === 'monthly') cur = addMonths(cur, 1)
      else break
    }
  }
  return expanded
}

export function useEvents(tab) {
  const { user } = useAuth()
  const [rawEvents, setRawEvents] = useState([])
  const [completedInstances, setCompletedInstances] = useState(new Set())
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

  // ACTIVE TABS
  const activeRaw = rawEvents.filter(e => !e.completed)
  const filtered = tab === 'everything'
    ? activeRaw
    : activeRaw.filter(e => e.tab === tab)

  const events = expandRecurring(filtered).filter(ev => {
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
      // NEVER touch the database for recurring instances
      // Just toggle local visual state
      const key = `${ev._baseId}_${ev.start_date}`
      setCompletedInstances(prev => {
        const next = new Set(prev)
        if (next.has(key)) next.delete(key)
        else next.add(key)
        return next
      })
      return
    }

    // Non-recurring only: toggle in DB
    const base = rawEvents.find(e => e.id === ev.id)
    if (!base) return

    // Safety check: never complete a recurring base event
    if (base.recurrence && base.recurrence !== 'none') {
      const key = `${ev.id}_${ev.start_date}`
      setCompletedInstances(prev => {
        const next = new Set(prev)
        if (next.has(key)) next.delete(key)
        else next.add(key)
        return next
      })
      return
    }

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