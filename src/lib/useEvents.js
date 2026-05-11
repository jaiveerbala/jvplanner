import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../lib/AuthContext'
import { supabase } from './supabase'
import { addDays, addWeeks, addMonths, format, parseISO, isAfter, startOfDay } from 'date-fns'

// Fetch all events for a user
async function fetchEvents(userId) {
  const { data } = await supabase.from('events').select('*').eq('user_id', userId).order('start_date')
  return data ?? []
}

// Fetch completed recurring instance keys
async function fetchCompletedKeys(userId) {
  const { data } = await supabase.from('recurring_completions').select('completion_key').eq('user_id', userId)
  return new Set((data ?? []).map(r => r.completion_key))
}

// Expand recurring events into daily/weekly/monthly instances
function buildEventList(baseEvents, completedKeys) {
  const result = []
  const today = startOfDay(new Date())
  const cutoff = addMonths(today, 6)

  for (const ev of baseEvents) {
    // Skip completed non-recurring events
    if (ev.completed && (!ev.recurrence || ev.recurrence === 'none')) continue

    if (!ev.recurrence || ev.recurrence === 'none') {
      result.push({ ...ev, _recurring: false })
      continue
    }

    // Recurring: generate instances
    const endDate = ev.recurrence_end ? parseISO(ev.recurrence_end) : cutoff
    let cur = parseISO(ev.start_date)
    let idx = 0

    while (idx < 500) {
      if (isAfter(cur, endDate) || isAfter(cur, cutoff)) break

      const ds = format(cur, 'yyyy-MM-dd')
      const instanceKey = `${ev.id}::${ds}`

      // Only add if not completed
      if (!completedKeys.has(instanceKey)) {
        result.push({
          ...ev,
          id: `${ev.id}__${idx}`,
          start_date: ds,
          completed: false,
          _recurring: true,
          _baseId: ev.id,
          _instanceKey: instanceKey,
        })
      }

      idx++
      if (ev.recurrence === 'daily') cur = addDays(cur, 1)
      else if (ev.recurrence === 'weekly') cur = addWeeks(cur, 1)
      else if (ev.recurrence === 'monthly') cur = addMonths(cur, 1)
      else break
    }
  }

  return result
}

export function useEvents(tab) {
  const { user } = useAuth()
  const [baseEvents, setBaseEvents] = useState([])
  const [completedKeys, setCompletedKeys] = useState(new Set())
  const [loading, setLoading] = useState(true)

  const reload = useCallback(async () => {
    if (!user) return
    setLoading(true)
    const [evs, keys] = await Promise.all([
      fetchEvents(user.id),
      fetchCompletedKeys(user.id)
    ])
    setBaseEvents(evs)
    setCompletedKeys(keys)
    setLoading(false)
  }, [user])

  useEffect(() => { reload() }, [reload])

  // Completed tab: only non-recurring completed events
  if (tab === 'completed') {
    const completed = baseEvents
      .filter(e => e.completed && (!e.recurrence || e.recurrence === 'none'))
      .sort((a, b) => new Date(b.completed_at || b.created_at) - new Date(a.completed_at || a.created_at))

    return {
      events: completed,
      rawEvents: baseEvents,
      loading,
      reload,
      restoreEvent: async (ev) => {
        await supabase.from('events').update({ completed: false, completed_at: null }).eq('id', ev.id)
        await reload()
      },
      removeEvent: async (ev) => {
        await supabase.from('events').delete().eq('id', ev.id)
        await reload()
      }
    }
  }

  // Filter base events by tab
  const tabFiltered = tab === 'everything'
    ? baseEvents
    : baseEvents.filter(e => e.tab === tab)

  // Build full event list with recurring instances expanded
  const events = buildEventList(tabFiltered, completedKeys)

  const addEvent = async (data) => {
    const { data: created } = await supabase
      .from('events')
      .insert({ ...data, user_id: user.id })
      .select().single()
    if (created) setBaseEvents(prev => [...prev, created])
    return created
  }

  const toggleEvent = async (ev) => {
    if (ev._recurring) {
      // RECURRING INSTANCE: only mark THIS day done, base event untouched
      const key = ev._instanceKey
      if (completedKeys.has(key)) {
        // Undo
        await supabase.from('recurring_completions')
          .delete().eq('user_id', user.id).eq('completion_key', key)
        setCompletedKeys(prev => { const n = new Set(prev); n.delete(key); return n })
      } else {
        // Mark done
        await supabase.from('recurring_completions')
          .insert({ user_id: user.id, completion_key: key, completed_at: new Date().toISOString() })
        setCompletedKeys(prev => new Set([...prev, key]))
      }
    } else {
      // NON-RECURRING: normal toggle
      const now = !ev.completed
      await supabase.from('events').update({
        completed: now,
        completed_at: now ? new Date().toISOString() : null
      }).eq('id', ev.id)
      setBaseEvents(prev => prev.map(e => e.id === ev.id ? { ...e, completed: now } : e))
    }
  }

  const removeEvent = async (ev) => {
    const id = ev._baseId || ev.id
    await supabase.from('events').delete().eq('id', id)
    setBaseEvents(prev => prev.filter(e => e.id !== id))
  }

  return { events, rawEvents: baseEvents, loading, addEvent, toggleEvent, removeEvent, reload }
}