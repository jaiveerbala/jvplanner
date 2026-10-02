import { useState, useEffect, useCallback, useRef } from 'react'
import { useAuth } from '../lib/AuthContext'
import { supabase } from './supabase'
import { addDays, addWeeks, addMonths, format, parseISO, isAfter, startOfDay } from 'date-fns'

// ── fetch helpers ────────────────────────────────────────────────
// These used to be `const { data } = await ...; return data ?? []`, which
// threw the `error` away. A failed request (expired token, dropped network,
// Supabase hiccup) looked exactly like "you have no tasks" — the UI loaded
// with an empty list and no indication anything had gone wrong.

const QUERY_TIMEOUT_MS = 12000

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
    ),
  ])
}

// Runs a Supabase query, throws on error, retries transient failures.
async function runQuery(label, build, attempts = 3) {
  let lastErr
  for (let i = 0; i < attempts; i++) {
    try {
      const { data, error } = await withTimeout(build(), QUERY_TIMEOUT_MS, label)
      if (error) throw error
      return data ?? []
    } catch (err) {
      lastErr = err
      console.warn(`[data] ${label} attempt ${i + 1}/${attempts} failed:`, err?.message || err)
      if (i < attempts - 1) {
        await new Promise(r => setTimeout(r, 400 * 2 ** i)) // 400ms, 800ms
      }
    }
  }
  throw lastErr
}

const fetchEvents = (userId) =>
  runQuery('fetchEvents', () =>
    supabase.from('events').select('*').eq('user_id', userId).order('start_date')
  )

const fetchCompletedKeys = (userId) =>
  runQuery('fetchCompletedKeys', () =>
    supabase.from('recurring_completions').select('completion_key').eq('user_id', userId)
  ).then(rows => new Set(rows.map(r => r.completion_key)))

// ── recurring expansion (unchanged) ──────────────────────────────
function buildEventList(baseEvents, completedKeys) {
  const result = []
  const today = startOfDay(new Date())
  const cutoff = addMonths(today, 6)

  for (const ev of baseEvents) {
    if (ev.completed && (!ev.recurrence || ev.recurrence === 'none')) continue

    if (!ev.recurrence || ev.recurrence === 'none') {
      result.push({ ...ev, _recurring: false })
      continue
    }

    const endDate = ev.recurrence_end ? parseISO(ev.recurrence_end) : cutoff
    let cur = parseISO(ev.start_date)
    let idx = 0

    while (idx < 500) {
      if (isAfter(cur, endDate) || isAfter(cur, cutoff)) break

      const ds = format(cur, 'yyyy-MM-dd')
      const instanceKey = `${ev.id}::${ds}`

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

// ── hook ─────────────────────────────────────────────────────────
export function useEvents(tab) {
  const { user } = useAuth()
  const userId = user?.id ?? null

  const [baseEvents, setBaseEvents] = useState([])
  const [completedKeys, setCompletedKeys] = useState(new Set())
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)

  const hasLoadedRef = useRef(false)
  const lastFetchRef = useRef(0)

  const reload = useCallback(async () => {
    if (!userId) return
    setLoading(true)
    lastFetchRef.current = Date.now()
    try {
      const [evs, keys] = await Promise.all([
        fetchEvents(userId),
        fetchCompletedKeys(userId),
      ])
      setBaseEvents(evs)
      setCompletedKeys(keys)
      setLoadError(null)
      hasLoadedRef.current = true
    } catch (err) {
      // Keep whatever we already had on screen rather than blanking it out.
      console.error('[data] load failed:', err)
      setLoadError(err?.message || 'Could not load your tasks')
    } finally {
      setLoading(false)
    }
  }, [userId])

  useEffect(() => { reload() }, [reload])

  // Refetch when the app comes back to the foreground or the network returns.
  // This is what makes a failed load self-heal instead of waiting for a
  // token-refresh event to happen to retrigger it.
  useEffect(() => {
    if (!userId) return

    const maybeRefetch = () => {
      if (document.visibilityState !== 'visible') return
      if (Date.now() - lastFetchRef.current < 10000) return // throttle
      reload()
    }

    document.addEventListener('visibilitychange', maybeRefetch)
    window.addEventListener('online', maybeRefetch)
    window.addEventListener('focus', maybeRefetch)
    return () => {
      document.removeEventListener('visibilitychange', maybeRefetch)
      window.removeEventListener('online', maybeRefetch)
      window.removeEventListener('focus', maybeRefetch)
    }
  }, [userId, reload])

  // ── completed tab ──────────────────────────────────────────────
  if (tab === 'completed') {
    const completed = baseEvents
      .filter(e => e.completed && (!e.recurrence || e.recurrence === 'none'))
      .sort((a, b) => new Date(b.completed_at || b.created_at) - new Date(a.completed_at || a.created_at))

    return {
      events: completed,
      rawEvents: baseEvents,
      loading,
      loadError,
      reload,
      restoreEvent: async (ev) => {
        const { error } = await supabase.from('events')
          .update({ completed: false, completed_at: null }).eq('id', ev.id)
        if (error) { console.error('[data] restore failed:', error); return }
        await reload()
      },
      removeEvent: async (ev) => {
        const { error } = await supabase.from('events').delete().eq('id', ev.id)
        if (error) { console.error('[data] delete failed:', error); return }
        await reload()
      }
    }
  }

  const tabFiltered = tab === 'everything'
    ? baseEvents
    : baseEvents.filter(e => e.tab === tab)

  const events = buildEventList(tabFiltered, completedKeys)

  const addEvent = async (data) => {
    const { data: created, error } = await supabase
      .from('events')
      .insert({ ...data, user_id: userId })
      .select().single()
    if (error) { console.error('[data] addEvent failed:', error); return null }
    if (created) setBaseEvents(prev => [...prev, created])
    return created
  }

  const toggleEvent = async (ev) => {
    if (ev._recurring) {
      const key = ev._instanceKey
      if (completedKeys.has(key)) {
        const { error } = await supabase.from('recurring_completions')
          .delete().eq('user_id', userId).eq('completion_key', key)
        if (error) { console.error('[data] uncomplete failed:', error); return }
        setCompletedKeys(prev => { const n = new Set(prev); n.delete(key); return n })
      } else {
        const { error } = await supabase.from('recurring_completions')
          .insert({ user_id: userId, completion_key: key, completed_at: new Date().toISOString() })
        if (error) { console.error('[data] complete failed:', error); return }
        setCompletedKeys(prev => new Set([...prev, key]))
      }
    } else {
      const now = !ev.completed
      const { error } = await supabase.from('events').update({
        completed: now,
        completed_at: now ? new Date().toISOString() : null
      }).eq('id', ev.id)
      if (error) { console.error('[data] toggle failed:', error); return }
      setBaseEvents(prev => prev.map(e => e.id === ev.id ? { ...e, completed: now } : e))
    }
  }

  const removeEvent = async (ev) => {
    const id = ev._baseId || ev.id
    const { error } = await supabase.from('events').delete().eq('id', id)
    if (error) { console.error('[data] remove failed:', error); return }
    setBaseEvents(prev => prev.filter(e => e.id !== id))
  }

  return { events, rawEvents: baseEvents, loading, loadError, addEvent, toggleEvent, removeEvent, reload }
}