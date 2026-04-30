import { supabase } from './supabase'

// ── EVENTS ──────────────────────────────────────────────────

export async function getEvents(userId) {
  const { data, error } = await supabase
    .from('events')
    .select('*')
    .eq('user_id', userId)
    .order('start_date', { ascending: true })
  if (error) throw error
  return data ?? []
}

export async function createEvent(userId, ev) {
  const { data, error } = await supabase
    .from('events')
    .insert({ ...ev, user_id: userId })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateEvent(id, updates) {
  const { data, error } = await supabase
    .from('events')
    .update(updates)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteEvent(id) {
  const { error } = await supabase.from('events').delete().eq('id', id)
  if (error) throw error
}

// ── COLLEGE MILESTONES ──────────────────────────────────────

export async function getMilestones(userId) {
  const { data, error } = await supabase
    .from('college_milestones')
    .select('*')
    .eq('user_id', userId)
    .order('grade_year')
  if (error) throw error
  return data ?? []
}

export async function createMilestone(userId, m) {
  const { data, error } = await supabase
    .from('college_milestones')
    .insert({ ...m, user_id: userId })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateMilestone(id, updates) {
  const { data, error } = await supabase
    .from('college_milestones')
    .update(updates)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteMilestone(id) {
  const { error } = await supabase.from('college_milestones').delete().eq('id', id)
  if (error) throw error
}

// ── SEED college milestones on first login ──────────────────

const SEED = [
  { title: 'Apply — Apple Maker Academy',        track: 'Summer Programs',   grade_year: 9,  status: 'not-started', notes: '' },
  { title: 'Apply — UCSB SRA',                   track: 'Summer Programs',   grade_year: 9,  status: 'not-started', notes: '' },
  { title: 'Apply — Shape Columbia',             track: 'Summer Programs',   grade_year: 9,  status: 'not-started', notes: '' },
  { title: 'Apply — UIUC Engineering',           track: 'Summer Programs',   grade_year: 9,  status: 'not-started', notes: '' },
  { title: 'Apply — Tufts Engineering',          track: 'Summer Programs',   grade_year: 9,  status: 'not-started', notes: '' },
  { title: 'Stimulus internship — July cohort',  track: 'Internship',        grade_year: 9,  status: 'not-started', notes: '1st week of July kick-off' },
  { title: 'Start summer research project',      track: 'Research',          grade_year: 9,  status: 'not-started', notes: '1–2 projects' },
  { title: 'Find publication venues for papers', track: 'Research',          grade_year: 10, status: 'not-started', notes: '' },
  { title: 'Build portfolio website',            track: 'Project Portfolio', grade_year: 9,  status: 'not-started', notes: 'Document completed projects' },
  { title: 'Research Synopsys — timing & criteria', track: 'Science Fairs', grade_year: 9,  status: 'not-started', notes: 'Design project to win' },
  { title: 'Submit to Synopsys',                 track: 'Science Fairs',     grade_year: 10, status: 'not-started', notes: '' },
  { title: 'Mech Lead — CAD workshops + FLL mentorship', track: 'Leadership', grade_year: 9, status: 'in-progress', notes: '' },
  { title: 'Mech Lead Captain + ASB Squad Captain', track: 'Leadership',     grade_year: 11, status: 'not-started', notes: '' },
  { title: 'Captain + ASBO',                     track: 'Leadership',        grade_year: 12, status: 'not-started', notes: '' },
]

export async function seedIfEmpty(userId) {
  const existing = await getMilestones(userId)
  if (existing.length > 0) return
  await supabase.from('college_milestones').insert(SEED.map(m => ({ ...m, user_id: userId })))
}

// ── CANVAS ICS IMPORT ───────────────────────────────────────

export function parseICS(icsText) {
  const events = []
  const blocks = icsText.split('BEGIN:VEVENT')
  for (let i = 1; i < blocks.length; i++) {
    const b = blocks[i]
    const summary = b.match(/SUMMARY[^:]*:(.+)/)?.[1]?.trim().replace(/\\,/g, ',').replace(/\\n/g, ' ')
    const dtstart = b.match(/DTSTART(?:;[^:]*)?:(\d{8}(?:T\d{6}Z?)?)/)?.[1]
    const desc = b.match(/DESCRIPTION[^:]*:(.+)/)?.[1]?.trim()
    if (!summary || !dtstart) continue
    const y = dtstart.slice(0,4), mo = dtstart.slice(4,6), d = dtstart.slice(6,8)
    const start_date = `${y}-${mo}-${d}`
    let start_time = null
    if (dtstart.length > 8) {
      start_time = `${dtstart.slice(9,11)}:${dtstart.slice(11,13)}`
    }
    events.push({ title: summary, start_date, start_time, notes: desc || '', tab: 'school', source: 'canvas', recurrence: 'none', completed: false })
  }
  return events
}
