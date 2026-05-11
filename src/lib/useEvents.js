import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../lib/AuthContext'
import { getEvents, createEvent, updateEvent, deleteEvent } from '../lib/db'
import { supabase } from './supabase'
import { addDays, addWeeks, addMonths, format, parseISO, isAfter, startOfDay } from 'date-fns'

function expandRecurring(events, completedKeys) {
  const expanded = []
  const today = startOfDay(new Date())
  const cutoff = addMonths(today, 6)

  for (const ev of events) {
    if (!ev.recurrence || ev.recurrence === 'none') {
      // Non-recurring: just push as-is
      expanded.push(ev)
      continue
    }

    // Recurring: expand into instances, never push the base event itself
    let cur = parseISO(ev.start_date)
    const end = ev.recurrence_end ? parseISO(ev.recurrence_end) : cutoff
    let i = 0

    while (!isAfter(cur, end) && !isAfter(cur, cutoff) && i < 400) {
      const dateStr = format(cur, 'yyyy-MM-dd')
      const key = `${ev.id}::${dateStr}`
      const isDone = completedKeys.has(key)

      // Only include if not done
      if (!isDone) {
        expanded.push({
          ...ev,
          id: `${ev.id}_r${i}`,
          start_date: dateStr,
          completed: false,
          _isRecurringInstance: true,
          _baseId: ev.id,
          _instanceKey: key,
        })
      }

      i++
      if (ev.recurrence === 'daily')       cur = addDays(cur, 1)
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
  const [completedKeys, setCompletedKeys] = useState(new Set())
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

  // COMPLETED TAB
  if (tab === 'completed') {
    const completed = [...rawEvents]
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

    return { events: completed, rawEvents, loading, restoreEvent, removeEvent, reload: load }
  }

  // ACTIVE TABS
  // Key fix: recurring base events are NEVER filtered by completed status
  // Only non-recurring events get filtered out when completed
  const activeRaw = rawEvents.filter(e => {
    const isRecurring = e.recurrence && e.recurrence !== 'none'
    if (isRecurring) return true // always keep recurring base events
    return !e.completed // only filter non-recurring completed events
  })

  const filtered = tab === 'everything'
    ? activeRaw
    : activeRaw.filter(e => e.tab === tab)

  const events = expandRecurring(filtered, completedKeys)

  const addEvent = async (data) => {
    const created = await createEvent(user.id, data)
    setRawEvents(prev => [...prev, created])
    return created
  }

  const toggleEvent = async (ev) => {
    if (ev._isRecurringInstance) {
      // Recurring instance: store completion in separate table, never touch base event
      const key = ev._instanceKey
      const isDone = completedKeys.has(key)

      if (isDone) {
        await supabase.from('recurring_completions').delete()
          .eq('user_id', user.id).eq('completion_key', key)
        setCompletedKeys(prev => { const n = new Set(prev); n.delete(key); return n })
      } else {
        await supabase.from('recurring_completions').insert({
          user_id: user.id,
          completion_key: key,
          completed_at: new Date().toISOString()
        })
        setCompletedKeys(prev => new Set([...prev, key]))
      }
      return
    }

    // Non-recurring: normal DB toggle
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