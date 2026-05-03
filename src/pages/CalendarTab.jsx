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
      const { supabase: sb } = await import('../lib/supabase')
      const { data: { user } } = await sb.auth.getUser()
      if (!user) throw new Error('Not logged in')

      // Fetch fresh Canvas data
      const res = await fetch(`${SUPABASE_URL}/functions/v1/canvas-sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ icsUrl: canvasUrl, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone })
      })
      const json = await res.json()
      if (json.error) throw new Error(json.error)
      localStorage.setItem('canvas_ics', canvasUrl)

      // Save URL for server-side hourly sync
      await sb.from('user_settings').upsert({
        user_id: user.id, canvas_ics_url: canvasUrl, updated_at: new Date().toISOString()
      })

      const todayStr = format(new Date(), 'yyyy-MM-dd')

      // Get completed titles from DB directly — never re-add these
      const { data: completedRows } = await sb
        .from('events').select('title')
        .eq('user_id', user.id).eq('source', 'canvas').eq('completed', true)
      const completedTitles = new Set((completedRows || []).map(e => e.title))

      // Delete ALL incomplete Canvas events from DB directly
      await sb.from('events').delete()
        .eq('user_id', user.id).eq('source', 'canvas').eq('completed', false)

      // Re-import fresh upcoming only
      const { createEvent: addEv } = await import('../lib/db')
      let added = 0
      for (const ev of json.events) {
        if (completedTitles.has(ev.title)) continue
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