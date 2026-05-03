import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { sendNotification, setVapidDetails } from 'https://esm.sh/web-push@3.6.7'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const VAPID_PUBLIC = 'BP7mdLKwdCvLxXATEfMYAWGi3HNloRWi5jeqcMtSVQ1NPpQaguhTJH7IcBpEhJzbDdPq9un0LZ070OOhBIdkrWg'
const VAPID_PRIVATE = '3rNS66PDMGUKtwKo0os3AYyVgIxbbi7XUI3WcfdNQBw'
const TIMEZONE = 'America/Los_Angeles'

setVapidDetails('mailto:jaiveerbala@gmail.com', VAPID_PUBLIC, VAPID_PRIVATE)

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const now = new Date()
    const localStr = now.toLocaleString('en-CA', {
      timeZone: TIMEZONE,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false
    })

    const [datePart, timePart] = localStr.split(', ')
    const currentDate = datePart.trim()
    const currentTime = timePart.trim().slice(0, 5) + ':00'
    const currentMinute = parseInt(timePart.trim().slice(3, 5))

    console.log(`Running at ${currentDate} ${currentTime} (${TIMEZONE})`)

    // ── PUSH NOTIFICATIONS (every minute) ──────────────────
    const { data: subscriptions } = await supabase
      .from('push_subscriptions')
      .select('*')

    let sent = 0
    if (subscriptions && subscriptions.length > 0) {
      for (const sub of subscriptions) {
        const { data: dueTasks } = await supabase
          .from('events')
          .select('*')
          .eq('user_id', sub.user_id)
          .eq('start_date', currentDate)
          .eq('start_time', currentTime)
          .eq('completed', false)

        if (!dueTasks || dueTasks.length === 0) continue

        for (const task of dueTasks) {
          try {
            const subscription = JSON.parse(sub.subscription)
            await sendNotification(
              subscription,
              JSON.stringify({ title: task.title, body: `Due now · ${task.tab}` }),
              { TTL: 86400 }
            )
            sent++
            console.log(`Sent notification: ${task.title}`)
          } catch (e) {
            console.error('Push error:', e.message)
            if (e.statusCode === 410 || e.statusCode === 404) {
              await supabase.from('push_subscriptions').delete().eq('id', sub.id)
            }
          }
        }
      }
    }

    // ── CANVAS SYNC (every hour, on the hour) ──────────────
    if (currentMinute === 0) {
      console.log('Running hourly Canvas sync...')
      await syncCanvas(supabase, currentDate)
    }

    return new Response(JSON.stringify({ sent, date: currentDate, time: currentTime }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  } catch (err) {
    console.error('Fatal:', err.message)
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})

async function syncCanvas(supabase: any, todayStr: string) {
  // Get all users with a saved Canvas URL
  const { data: settings } = await supabase
    .from('user_settings')
    .select('*')
    .not('canvas_ics_url', 'is', null)

  if (!settings || settings.length === 0) {
    console.log('No Canvas URLs configured')
    return
  }

  for (const setting of settings) {
    try {
      const userId = setting.user_id
      const icsUrl = setting.canvas_ics_url

      // Fetch Canvas feed
      const res = await fetch(icsUrl)
      if (!res.ok) throw new Error(`Canvas fetch failed: ${res.status}`)
      const icsText = await res.text()
      const events = parseICS(icsText)

      // Get completed Canvas titles — never touch these
      const { data: completedEvents } = await supabase
        .from('events')
        .select('title')
        .eq('user_id', userId)
        .eq('source', 'canvas')
        .eq('completed', true)

      const completedTitles = new Set((completedEvents || []).map((e: any) => e.title))

      // Delete all incomplete Canvas events for this user
      await supabase
        .from('events')
        .delete()
        .eq('user_id', userId)
        .eq('source', 'canvas')
        .eq('completed', false)

      // Re-import future/today events only
      let added = 0
      for (const ev of events) {
        if (completedTitles.has(ev.title)) continue
        if (ev.start_date && ev.start_date < todayStr) continue
        await supabase.from('events').insert({ ...ev, user_id: userId })
        added++
      }

      console.log(`Canvas sync for user ${userId}: ${added} events imported`)
    } catch (e) {
      console.error(`Canvas sync error for user ${setting.user_id}:`, e.message)
    }
  }
}

function parseICS(icsText: string) {
  const events = []
  const blocks = icsText.split('BEGIN:VEVENT')

  for (let i = 1; i < blocks.length; i++) {
    const b = blocks[i]
    const summary = extractField(b, 'SUMMARY')
    const dtstart = extractField(b, 'DTSTART')
    const description = extractField(b, 'DESCRIPTION')
    if (!summary || !dtstart) continue

    const { date, time } = convertDateTime(dtstart)
    events.push({
      title: cleanText(summary),
      start_date: date,
      start_time: time,
      notes: cleanText(description || ''),
      tab: 'school',
      source: 'canvas',
      recurrence: 'none',
      completed: false,
      is_meeting: false,
      duration_minutes: 0,
    })
  }
  return events
}

function extractField(block: string, field: string): string | null {
  const lines = block.split('\n')
  const idx = lines.findIndex(l => l.match(new RegExp(`^${field}[;:]`, 'i')))
  if (idx < 0) return null
  let full = lines[idx].replace(/^[^:]+:/, '')
  let next = idx + 1
  while (next < lines.length && (lines[next].startsWith(' ') || lines[next].startsWith('\t'))) {
    full += lines[next].trim()
    next++
  }
  return full.replace(/\r/g, '').trim()
}

function convertDateTime(dtstart: string): { date: string, time: string | null } {
  const digits = dtstart.replace(/[^0-9]/g, '')
  if (!dtstart.includes('T')) {
    return { date: `${digits.slice(0,4)}-${digits.slice(4,6)}-${digits.slice(6,8)}`, time: null }
  }
  try {
    const utcStr = `${digits.slice(0,4)}-${digits.slice(4,6)}-${digits.slice(6,8)}T${digits.slice(8,10)}:${digits.slice(10,12)}:00Z`
    const d = new Date(utcStr)
    const local = d.toLocaleString('en-CA', {
      timeZone: 'America/Los_Angeles',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false
    })
    const [dp, tp] = local.split(', ')
    return { date: dp.trim(), time: tp ? tp.trim().slice(0,5) : null }
  } catch {
    return { date: `${digits.slice(0,4)}-${digits.slice(4,6)}-${digits.slice(6,8)}`, time: null }
  }
}

function cleanText(text: string): string {
  return text.replace(/\\n/g, ' ').replace(/\\,/g, ',').replace(/\\/g, '').trim()
}
