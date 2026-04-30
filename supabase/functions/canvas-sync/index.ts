import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { icsUrl, timezone } = await req.json()

    if (!icsUrl || !icsUrl.includes('instructure.com')) {
      return new Response(JSON.stringify({ error: 'Invalid Canvas URL' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const response = await fetch(icsUrl)
    if (!response.ok) throw new Error(`Canvas returned ${response.status}`)

    const icsText = await response.text()
    const events = parseICS(icsText, timezone || 'America/Los_Angeles')

    return new Response(JSON.stringify({ events }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})

function parseICS(icsText: string, timezone: string) {
  const events = []
  const blocks = icsText.split('BEGIN:VEVENT')

  for (let i = 1; i < blocks.length; i++) {
    const b = blocks[i]

    const summary = extractField(b, 'SUMMARY')
    const dtstart = extractField(b, 'DTSTART')
    const description = extractField(b, 'DESCRIPTION')

    if (!summary || !dtstart) continue

    // Convert UTC time to local timezone
    const { date, time } = convertDateTime(dtstart, timezone)

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

function convertDateTime(dtstart: string, timezone: string): { date: string, time: string | null } {
  const digits = dtstart.replace(/[^0-9T]/g, '')
  
  // All-day event (no time component)
  if (!dtstart.includes('T')) {
    const y = digits.slice(0, 4)
    const m = digits.slice(4, 6)
    const d = digits.slice(6, 8)
    return { date: `${y}-${m}-${d}`, time: null }
  }

  try {
    // Parse as UTC datetime
    const y = digits.slice(0, 4)
    const mo = digits.slice(4, 6)
    const d = digits.slice(6, 8)
    const h = digits.slice(9, 11)
    const min = digits.slice(11, 13)
    const s = digits.slice(13, 15) || '00'

    const utcString = `${y}-${mo}-${d}T${h}:${min}:${s}Z`
    const utcDate = new Date(utcString)

    // Convert to target timezone
    const localStr = utcDate.toLocaleString('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })

    // Parse the locale string — format: "YYYY-MM-DD, HH:MM"
    const [datePart, timePart] = localStr.split(', ')
    const date = datePart.trim()
    const time = timePart ? timePart.trim().slice(0, 5) : null

    return { date, time }
  } catch {
    // Fallback: return raw
    const y = digits.slice(0, 4)
    const m = digits.slice(4, 6)
    const d = digits.slice(6, 8)
    return { date: `${y}-${m}-${d}`, time: null }
  }
}

function extractField(block: string, field: string): string | null {
  const lines = block.split('\n')
  const fieldLine = lines.findIndex(l => l.match(new RegExp(`^${field}[;:]`, 'i')))
  if (fieldLine < 0) return null
  let full = lines[fieldLine].replace(/^[^:]+:/, '')
  let next = fieldLine + 1
  while (next < lines.length && (lines[next].startsWith(' ') || lines[next].startsWith('\t'))) {
    full += lines[next].trim()
    next++
  }
  return full.replace(/\r/g, '').trim()
}

function cleanText(text: string): string {
  return text
    .replace(/\\n/g, ' ')
    .replace(/\\,/g, ',')
    .replace(/\\/g, '')
    .trim()
}
