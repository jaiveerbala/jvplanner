import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../lib/AuthContext'
import { getEvents, createEvent, updateEvent, deleteEvent } from '../lib/db'
import { supabase } from './supabase'
import { addDays, addWeeks, addMonths, format, parseISO, isAfter, startOfDay } from 'date-fns'

// Expand a recurring base event into individual day instances
function expandRecurring(events, completedKeys) {
  const expanded = []
  const today = startOfDay(new Date())
  const cutoff = addMonths(today, 6)

  for (const ev of events) {
    if (!ev.recurrence || ev.recurrence === 'none') {
      expanded.push(ev)
      continue
    }

    let cur = parseISO(ev.start_date)
    const end = ev.recurrence_end ? parseISO(ev.recurrence_end) : cutoff
    let i = 0

    while (!isAfter(cur, end) && !isAfter(cur, cutoff) && i < 400) {
      const dateStr = format(cur, 'yyyy-MM-dd')
      const key = `${ev.id}::${dateStr}`
      const isDone = completedKeys.has(key)

      expanded.push({
        ...ev,
        id: `${ev.id}_r${i}`,
        start_date: dateStr,
        completed: isDone,
        completed_at: isDone ? 'instance' : null,
        _isRecurringInstance: true,
        _baseId: ev.id,
        _instanceKey: key,
      })

      i++
      if (ev.recurrence === 'daily')        cur = addDays(cur, 1)
      else if (ev.recurrence === 'weekly')   cur = addWeeks(cur, 1)
      else if (ev.recurrence === 'monthly')  cur = addMonths(cur, 1)
      else break
    }
  }
  return expanded
}

export function useEvents(tab) {
  const { user } = useAuth()
  const [rawEvents, setRawEvents] = useState([])
  const [completedKeys, setCompletedKeys] = useState(new Set()) // "baseId::date"
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!user) return
    setLoading(true)
    const [evData, compData] = await Promise.all([
      getEvents(user.id),
      supabase.from('recurring_completions').select('completion_key').eq('user_id', user.id)
    ])
    setRawEvents(evData)
    setCompletedKeys(new Set((compData.data || []).map(r => r.completion_key)))
    setLoading(false)
  }, [user])

  useEffect(() => { load() }, [load])

  // COMPLETED TAB - show non-recurring completed events + recurring instances marked done
  if (tab === 'completed') {
    const nonRecurringCompleted = rawEvents
      .filter(e => e.completed && (!e.recurrence || e.recurrence === 'none'))
      .sort((a, b) => new Date(b.completed_at || b.created_at) - new Date(a.completed_at || a.created_at))

    const restoreEvent = async (ev) => {
      const updated = await updateEvent(ev.id, { completed: false, completed_at: null })
      setRawEvents(prev => prev.map(e => e.id === ev.id ? updated : e))
    }

    const removeEvent = async (ev) => {
      await deleteEvent(ev.id)
      setRawEvents(prev => prev.filter(e => e.id !== ev.id))
    }

    return { events: nonRecurringCompleted, rawEvents, loading, restoreEvent, removeEvent, reload: load }
  }

  // ACTIVE TABS
  // Only filter out completed for NON-recurring events
  const activeRaw = rawEvents.filter(e => {
    if (!e.recurrence || e.recurrence === 'none') return !e.completed
    return true // always include recurring base events
  })

  const filtered = tab === 'everything'
    ? activeRaw
    : activeRaw.filter(e => e.tab === tab)

  // Expand recurring events into instances, marking done ones
  const events = expandRecurring(filtered, completedKeys)
    // Hide completed instances from calendar/list
    .filter(ev => !ev.completed)

  const addEvent = async (data) => {
    const created = await createEvent(user.id, data)
    setRawEvents(prev => [...prev, created])
    return created
  }

  const toggleEvent = async (ev) => {
    if (ev._isRecurringInstance) {
      const key = ev._instanceKey
      const isDone = completedKeys.has(key)

      if (isDone) {
        // Undo: remove from recurring_completions
        await supabase.from('recurring_completions').delete()
          .eq('user_id', user.id).eq('completion_key', key)
        setCompletedKeys(prev => { const n = new Set(prev); n.delete(key); return n })
      } else {
        // Mark done: insert into recurring_completions
        await supabase.from('recurring_completions').insert({
          user_id: user.id,
          completion_key: key,
          completed_at: new Date().toISOString()
        })
        setCompletedKeys(prev => new Set([...prev, key]))
      }
      return
    }

    // Non-recurring: normal toggle
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