import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  format, parseISO, startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  eachDayOfInterval, addMonths, isSameMonth,
} from 'date-fns'
import { supabase } from '../lib/supabase'
import './summer-programs.css'

export const TIERS = [
  { id: 'super_reach', label: 'Super Reach', color: '#f87171' },
  { id: 'reach', label: 'Reach', color: '#f59e0b' },
  { id: 'normal', label: 'Normal Aim', color: '#60a5fa' },
  { id: 'safety', label: 'Safety', color: '#34d399' },
]

export const STATUSES = [
  { id: 'not_started', label: 'Not started' },
  { id: 'in_progress', label: 'In progress' },
  { id: 'submitted', label: 'Submitted' },
]

const EMPTY = {
  name: '', url: '', tier: 'normal', open_date: '', due_date: '',
  open_is_estimate: false, due_is_estimate: false, notes: '',
}

const normalizeUrl = (raw) => {
  const s = (raw || '').trim()
  if (!s) return null
  return /^https?:\/\//i.test(s) ? s : `https://${s}`
}

const fmtDate = (d) => format(parseISO(d), 'MMM d, yyyy')
const todayStr = () => format(new Date(), 'yyyy-MM-dd')

// due_date ascending, nulls last; ties keep the original (seed) order.
const byDue = (a, b) => {
  if (a.due_date !== b.due_date) {
    if (!a.due_date) return 1
    if (!b.due_date) return -1
    return a.due_date < b.due_date ? -1 : 1
  }
  return (a.sort_order ?? 1e9) - (b.sort_order ?? 1e9) || a.name.localeCompare(b.name)
}

const toRow = (form) => ({
  name: form.name.trim(),
  url: normalizeUrl(form.url),
  tier: form.tier,
  open_date: form.open_date || null,
  due_date: form.due_date || null,
  // An estimate flag is meaningless without a date.
  open_is_estimate: !!form.open_date && form.open_is_estimate,
  due_is_estimate: !!form.due_date && form.due_is_estimate,
  notes: form.notes.trim() || null,
})

// ── data ─────────────────────────────────────────────────────────
// The ONE source of truth. Tracks.jsx calls this once and hands the same
// `programs` array to both the cell and the calendar, so any add / edit /
// delete / re-tier shows up in both on the same render.
export function useSummerPrograms(userId) {
  const [programs, setPrograms] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fail = (label, err) => {
    console.error(`[data] summer_programs ${label} failed:`, err)
    setError(err.message || String(err))
  }

  const load = useCallback(async () => {
    if (!userId) return
    try {
      // One-time seed. The database function claims the flag and inserts the
      // rows in a single transaction, so it is safe with two tabs open and can
      // never run twice. We only call it while the flag is still false.
      const { data: settings, error: sErr } = await supabase
        .from('user_settings').select('summer_programs_seeded')
        .eq('user_id', userId).maybeSingle()
      if (sErr) throw sErr
      if (!settings?.summer_programs_seeded) {
        const { error: seedErr } = await supabase.rpc('seed_summer_programs')
        if (seedErr) throw seedErr
      }
      const { data, error: pErr } = await supabase
        .from('summer_programs').select('*').eq('user_id', userId)
      if (pErr) throw pErr
      setPrograms(data || [])
      setError(null)
    } catch (err) {
      fail('load', err)
    } finally {
      setLoading(false)
    }
  }, [userId])

  useEffect(() => { load() }, [load])

  const addProgram = async (form) => {
    const maxOrder = programs.reduce((m, p) => Math.max(m, p.sort_order ?? 0), 0)
    const { data, error: err } = await supabase.from('summer_programs')
      .insert({ ...toRow(form), user_id: userId, sort_order: maxOrder + 1 })
      .select().single()
    if (err) { fail('add', err); return false }
    setPrograms(prev => [...prev, data])
    setError(null)
    return true
  }

  const updateProgram = async (id, form) => {
    const { data, error: err } = await supabase.from('summer_programs')
      .update(toRow(form)).eq('id', id).select().single()
    if (err) { fail('update', err); return false }
    setPrograms(prev => prev.map(p => (p.id === id ? data : p)))
    setError(null)
    return true
  }

  // Small direct update (status toggle, applying a date found by the site check).
  // Optimistic: the UI changes immediately and rolls back if the save fails.
  const patchProgram = async (id, patch) => {
    const before = programs.find(p => p.id === id)
    if (!before) return false
    setPrograms(prev => prev.map(p => (p.id === id ? { ...p, ...patch } : p)))
    const { error: err } = await supabase.from('summer_programs').update(patch).eq('id', id)
    if (err) {
      setPrograms(prev => prev.map(p => (p.id === id ? before : p)))
      fail('update', err)
      return false
    }
    setError(null)
    return true
  }

  // Site check: an edge function fetches every program's page and reports any
  // application dates it can find. Nothing is changed until you tap a button.
  const [check, setCheck] = useState({ running: false, results: null, checkedAt: null, error: null })
  const runCheck = async () => {
    setCheck(c => ({ ...c, running: true, error: null }))
    try {
      const { data, error: err } = await supabase.functions.invoke('check-summer-programs')
      if (err) throw err
      if (data?.error) throw new Error(data.error)
      const results = {}
      for (const r of data.results || []) results[r.id] = r
      setCheck({ running: false, results, checkedAt: data.checked_at, error: null })
    } catch (err) {
      console.error('[data] site check failed:', err)
      setCheck(c => ({ ...c, running: false, error: err.message || 'Site check failed' }))
    }
  }
  const clearCheck = () => setCheck({ running: false, results: null, checkedAt: null, error: null })

  // Same confirmation pattern as the Plan tab.
  const deleteProgram = async (program) => {
    if (!window.confirm(`Delete "${program.name}"?`)) return false
    const { error: err } = await supabase.from('summer_programs').delete().eq('id', program.id)
    if (err) { fail('delete', err); return false }
    setPrograms(prev => prev.filter(p => p.id !== program.id))
    setError(null)
    return true
  }

  return { programs, loading, error, addProgram, updateProgram, patchProgram, deleteProgram, check, runCheck, clearCheck }
}

// ── cell ─────────────────────────────────────────────────────────
export function SummerProgramsCell({ sp, editingId, setEditingId }) {
  const { programs, loading, check } = sp
  const submitted = programs.filter(p => p.status === 'submitted').length
  return (
    <section className="track-cell sp-cell">
      <header className="track-cell-head sp-head">
        <span className="track-cell-pip" style={{ background: '#f59e0b' }} />
        <span className="track-cell-label">Summer Programs</span>
        <span className="track-cell-count">{submitted}/{programs.length} submitted</span>
        <button className="btn-ghost sp-check-btn" onClick={sp.runCheck}
          disabled={check.running || programs.length === 0}
          title="Fetch every program's page and look for application dates">
          {check.running ? 'Checking sites…' : '↻ Check sites for dates'}
        </button>
      </header>
      <CheckSummary programs={programs} check={check} onClear={sp.clearCheck} />
      <div className="sp-tiers">
        {TIERS.map(tier => (
          <TierGroup key={tier.id} tier={tier} loading={loading} sp={sp}
            items={programs.filter(p => p.tier === tier.id).sort(byDue)}
            editingId={editingId} setEditingId={setEditingId} />
        ))}
      </div>
    </section>
  )
}

const needsDates = (p) => !p.open_date || !p.due_date || p.open_is_estimate || p.due_is_estimate

function CheckSummary({ programs, check, onClear }) {
  if (check.error) {
    return (
      <div className="sp-check-summary err">
        <span>Site check failed: {check.error}</span>
        <button className="icon-btn" title="Dismiss" onClick={onClear}>✕</button>
      </div>
    )
  }
  if (!check.results) return null
  const rs = programs.map(p => [p, check.results[p.id]]).filter(([, r]) => r)
  const found = rs.filter(([p, r]) => r.ok && r.candidates.length > 0 && needsDates(p)).length
  const unreadable = rs.filter(([, r]) => !r.ok).length
  return (
    <div className="sp-check-summary">
      <span>
        Checked {rs.length} site{rs.length === 1 ? '' : 's'} at {format(parseISO(check.checkedAt), 'h:mm a')} ·{' '}
        <b>{found}</b> with possible dates for a TBA/est. entry · {unreadable} couldn't be read.
        {' '}Nothing was changed — review each one below.
      </span>
      <button className="icon-btn" title="Hide results" onClick={onClear}>✕</button>
    </div>
  )
}

function TierGroup({ tier, items, loading, sp, editingId, setEditingId }) {
  const [adding, setAdding] = useState(false)
  return (
    <div className="sp-tier" data-tier={tier.id}>
      <div className="sp-tier-head">
        <span className="sp-tier-bar" style={{ background: tier.color }} />
        <span className="sp-tier-label">{tier.label}</span>
        <span className="sp-tier-count">{items.length}</span>
      </div>
      <div className="sp-tier-body">
        {loading && <div className="track-empty">Loading...</div>}
        {!loading && items.length === 0 && !adding && <div className="track-empty">Nothing here yet.</div>}
        {items.map(p => (
          editingId === p.id ? (
            <ProgramForm key={p.id} id={`sp-${p.id}`} initial={p} submitLabel="Save"
              onCancel={() => setEditingId(null)}
              onSubmit={async (form) => { if (await sp.updateProgram(p.id, form)) setEditingId(null) }} />
          ) : (
            <ProgramRow key={p.id} program={p} result={sp.check.results?.[p.id]}
              onPatch={(patch) => sp.patchProgram(p.id, patch)}
              onEdit={() => setEditingId(p.id)}
              onDelete={() => sp.deleteProgram(p)} />
          )
        ))}
        {adding ? (
          <ProgramForm initial={{ ...EMPTY, tier: tier.id }} submitLabel="Add"
            onCancel={() => setAdding(false)}
            onSubmit={async (form) => { if (await sp.addProgram(form)) setAdding(false) }} />
        ) : (
          <button className="btn-add sp-add" onClick={() => setAdding(true)}>+ Add program</button>
        )}
      </div>
    </div>
  )
}

function DateLine({ label, date, est }) {
  return (
    <div className="sp-date">
      <span className="sp-date-label">{label}</span>
      {date
        ? <span className="sp-date-value">{fmtDate(date)}</span>
        : <span className="sp-date-value tba">TBA</span>}
      {date && est && <span className="sp-est" title="Estimated date">est.</span>}
    </div>
  )
}

// Tap to cycle: Not started → In progress → Submitted → Not started.
function StatusToggle({ status, onChange }) {
  const i = Math.max(0, STATUSES.findIndex(s => s.id === status))
  const cur = STATUSES[i]
  const next = STATUSES[(i + 1) % STATUSES.length]
  return (
    <button type="button" className={`sp-status ${cur.id}`}
      title={`Tap to mark "${next.label}"`} aria-label={`Status: ${cur.label}. Tap to mark ${next.label}.`}
      onClick={() => onChange(next.id)}>
      <span className="sp-status-dot" />{cur.label}
    </button>
  )
}

function SiteCheck({ program: p, result, onPatch }) {
  const needs = needsDates(p)
  const [open, setOpen] = useState(needs)
  if (!result) return null
  if (!result.ok) return <div className="sp-check"><div className="sp-check-line warn">Site check: {result.reason}</div></div>
  const n = result.candidates.length
  // Only worth a line when this entry is still waiting on a date.
  if (n === 0) return needs ? <div className="sp-check"><div className="sp-check-line">Site check: no dates found on the page.</div></div> : null
  return (
    <div className={`sp-check${needs ? ' needs' : ''}`}>
      <button type="button" className="sp-check-line toggle" onClick={() => setOpen(o => !o)}>
        Site check: {n} possible date{n === 1 ? '' : 's'} {open ? '▾' : '▸'}
      </button>
      {open && result.candidates.map(c => {
        const isOpen = p.open_date === c.date && !p.open_is_estimate
        const isDue = p.due_date === c.date && !p.due_is_estimate
        return (
          <div className="sp-cand" key={`${c.date}-${c.kind}`}>
            <div className="sp-cand-top">
              <span className="sp-cand-date">{fmtDate(c.date)}</span>
              {c.kind !== 'unknown' && <span className={`sp-cand-kind ${c.kind}`}>looks like {c.kind === 'open' ? 'opens' : 'due'}</span>}
              {c.year_assumed && <span className="sp-est" title="The page gave no year">year assumed</span>}
            </div>
            <div className="sp-cand-snippet">“…{c.snippet}…”</div>
            <div className="sp-cand-actions">
              {isOpen ? <span className="sp-cand-set">✓ Set as opens</span> : (
                <button className={c.kind === 'open' ? 'btn-primary' : 'btn-ghost'}
                  onClick={() => onPatch({ open_date: c.date, open_is_estimate: false })}>Set as opens</button>
              )}
              {isDue ? <span className="sp-cand-set">✓ Set as due</span> : (
                <button className={c.kind === 'due' ? 'btn-primary' : 'btn-ghost'}
                  onClick={() => onPatch({ due_date: c.date, due_is_estimate: false })}>Set as due</button>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function ProgramRow({ program: p, result, onPatch, onEdit, onDelete }) {
  const [open, setOpen] = useState(false)
  const long = (p.notes || '').length > 90
  return (
    <div className={`sp-row${p.status === 'submitted' ? ' submitted' : ''}`} id={`sp-${p.id}`}>
      <div className="sp-row-top">
        {p.url ? (
          <a className="sp-name" href={p.url} target="_blank" rel="noopener noreferrer">{p.name} ↗</a>
        ) : (
          <span className="sp-name nolink">{p.name}</span>
        )}
        <div className="track-row-actions">
          <button className="icon-btn" title="Edit" onClick={onEdit}>✎</button>
          <button className="icon-btn del" title="Delete" onClick={onDelete}>✕</button>
        </div>
      </div>
      <div className="sp-dates">
        <DateLine label="OPENS" date={p.open_date} est={p.open_is_estimate} />
        <DateLine label="DUE" date={p.due_date} est={p.due_is_estimate} />
        <StatusToggle status={p.status} onChange={(status) => onPatch({ status })} />
      </div>
      {p.notes && (
        <div className={`sp-notes${open ? ' open' : ''}${long ? ' clickable' : ''}`}
          onClick={long ? () => setOpen(o => !o) : undefined}
          title={long ? (open ? 'Click to collapse' : 'Click to expand') : undefined}>
          {p.notes}
        </div>
      )}
      <SiteCheck program={p} result={result} onPatch={onPatch} />
    </div>
  )
}

function ProgramForm({ id, initial, submitLabel, onSubmit, onCancel }) {
  const [form, setForm] = useState({
    name: initial.name || '',
    url: initial.url || '',
    tier: initial.tier,
    open_date: initial.open_date || '',
    due_date: initial.due_date || '',
    open_is_estimate: !!initial.open_is_estimate,
    due_is_estimate: !!initial.due_is_estimate,
    notes: initial.notes || '',
  })
  const [busy, setBusy] = useState(false)
  const set = (k, v) => setForm(prev => ({ ...prev, [k]: v }))

  const submit = async () => {
    if (!form.name.trim() || busy) return
    setBusy(true)
    await onSubmit(form)
    setBusy(false)
  }
  const onKey = (e) => {
    if (e.key === 'Enter') submit()
    if (e.key === 'Escape') onCancel()
  }

  const dateField = (label, dateKey, estKey) => (
    <label className="track-field">
      <span>{label}</span>
      <div className="sp-date-input">
        <input type="date" value={form[dateKey]} onChange={e => set(dateKey, e.target.value)} />
        {/* Toggle button, not a checkbox: the global input reset hides native checkboxes. */}
        <button type="button" className={`sp-est-toggle${form[estKey] ? ' on' : ''}`}
          disabled={!form[dateKey]} aria-pressed={form[estKey]}
          title="Mark this date as an estimate"
          onClick={() => set(estKey, !form[estKey])}>est.</button>
        {form[dateKey] && (
          <button type="button" className="sp-clear" title="Clear date (TBA)"
            onClick={() => setForm(prev => ({ ...prev, [dateKey]: '', [estKey]: false }))}>✕</button>
        )}
      </div>
    </label>
  )

  return (
    <div className="track-form track-form-inline sp-form" id={id}>
      <input autoFocus placeholder="Program name" value={form.name}
        onChange={e => set('name', e.target.value)} onKeyDown={onKey} />
      <input type="url" placeholder="Link (optional)" value={form.url}
        onChange={e => set('url', e.target.value)} onKeyDown={onKey} />
      <label className="track-field">
        <span>TIER</span>
        <select value={form.tier} onChange={e => set('tier', e.target.value)}>
          {TIERS.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
        </select>
      </label>
      <div className="sp-form-dates">
        {dateField('APPLICATION OPENS', 'open_date', 'open_is_estimate')}
        {dateField('APPLICATION DUE', 'due_date', 'due_is_estimate')}
      </div>
      <label className="track-field">
        <span>NOTES</span>
        <textarea rows={3} value={form.notes} onChange={e => set('notes', e.target.value)}
          onKeyDown={e => e.key === 'Escape' && onCancel()} />
      </label>
      <div className="track-form-actions">
        <button className="btn-ghost" onClick={onCancel}>Cancel</button>
        <button className="btn-primary" onClick={submit} disabled={busy}>{submitLabel}</button>
      </div>
    </div>
  )
}

// ── calendar ─────────────────────────────────────────────────────
// Built from `programs` on every render. Nothing here is stored anywhere:
// these markers never touch the `events` table or the main calendar.
export function SummerCalendar({ programs, onSelect }) {
  const [month, setMonth] = useState(() => startOfMonth(new Date()))

  const markers = useMemo(() => {
    const out = []
    for (const p of programs) {
      if (p.open_date) out.push({ key: `${p.id}-open`, id: p.id, kind: 'open', date: p.open_date, est: p.open_is_estimate, label: `Opens: ${p.name}` })
      if (p.due_date) out.push({ key: `${p.id}-due`, id: p.id, kind: 'due', date: p.due_date, est: p.due_is_estimate, label: `Due: ${p.name}` })
    }
    return out.sort((a, b) => (a.date === b.date ? a.label.localeCompare(b.label) : a.date < b.date ? -1 : 1))
  }, [programs])

  const byDay = useMemo(() => {
    const map = new Map()
    for (const m of markers) {
      if (!map.has(m.date)) map.set(m.date, [])
      map.get(m.date).push(m)
    }
    return map
  }, [markers])

  const today = todayStr()
  const nextDeadline = markers.find(m => m.kind === 'due' && m.date >= today)
  const days = eachDayOfInterval({ start: startOfWeek(startOfMonth(month)), end: endOfWeek(endOfMonth(month)) })
  const monthKey = format(month, 'yyyy-MM')
  const monthMarkers = markers.filter(m => m.date.startsWith(monthKey))

  const chip = (m, withDate) => (
    <button key={m.key} type="button" title={m.label + (m.est ? ' (estimated)' : '')}
      className={`sp-cal-chip ${m.kind}${m.est ? ' est' : ''}`}
      onClick={() => onSelect(m.id)}>
      {withDate && <span className="sp-cal-chip-date">{format(parseISO(m.date), 'MMM d')}</span>}
      <span className="sp-cal-chip-text">{m.label}</span>
      {withDate && m.est && <span className="sp-est">est.</span>}
    </button>
  )

  return (
    <section className="track-cell sp-cal">
      <header className="track-cell-head sp-cal-head">
        <span className="track-cell-label">Summer Program Calendar</span>
        <div className="sp-cal-nav">
          <button className="btn-ghost sp-cal-btn" disabled={!nextDeadline}
            title={nextDeadline ? `${nextDeadline.label} — ${fmtDate(nextDeadline.date)}` : 'No upcoming deadlines'}
            onClick={() => nextDeadline && setMonth(startOfMonth(parseISO(nextDeadline.date)))}>
            Jump to next deadline
          </button>
          <button className="btn-ghost sp-cal-btn" onClick={() => setMonth(startOfMonth(new Date()))}>Today</button>
          <button className="cal-nav-btn" aria-label="Previous month" onClick={() => setMonth(m => addMonths(m, -1))}>‹</button>
          <span className="sp-cal-month">{format(month, 'MMMM yyyy')}</span>
          <button className="cal-nav-btn" aria-label="Next month" onClick={() => setMonth(m => addMonths(m, 1))}>›</button>
        </div>
      </header>

      <div className="sp-cal-legend">
        <span className="sp-cal-chip open static">Opens</span>
        <span className="sp-cal-chip due static">Due</span>
        <span className="sp-cal-chip due est static">Dashed = estimated</span>
      </div>

      <div className="sp-cal-grid">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
          <div key={d} className="sp-cal-dow">{d}</div>
        ))}
        {days.map(day => {
          const ds = format(day, 'yyyy-MM-dd')
          const list = byDay.get(ds) || []
          return (
            <div key={ds} className={`sp-cal-day${isSameMonth(day, month) ? '' : ' out'}${ds === today ? ' today' : ''}`}>
              <span className="sp-cal-num">{format(day, 'd')}</span>
              {list.map(m => chip(m, false))}
            </div>
          )
        })}
      </div>

      <div className="sp-cal-list">
        <div className="sp-cal-list-title">{format(month, 'MMMM')} — {monthMarkers.length} date{monthMarkers.length === 1 ? '' : 's'}</div>
        {monthMarkers.length === 0 && <div className="track-empty">No program dates this month.</div>}
        {monthMarkers.map(m => chip(m, true))}
      </div>
    </section>
  )
}