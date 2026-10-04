import { useState, useEffect, useCallback } from 'react'
import { format, parseISO, differenceInCalendarDays } from 'date-fns'
import { useAuth } from '../lib/AuthContext'
import { supabase } from '../lib/supabase'

// Each cell on the page. `fields` controls what the add/edit form asks for.
// To add a fifth cell later, add one entry here — nothing else changes.
const CELLS = [
  { id: 'summer_program', label: 'Summer Programs', color: '#f59e0b',
    placeholder: 'Program name', fields: ['open_date', 'link'] },
  { id: 'internship', label: 'Summer Internships', color: '#60a5fa',
    placeholder: 'Internship / company', fields: ['link'] },
  { id: 'volunteering', label: 'Volunteering', color: '#34d399',
    placeholder: 'Where you volunteer', fields: ['hours'] },
  { id: 'competition', label: 'Competitions', color: '#c084fc',
    placeholder: 'Competition name', fields: [] },
]

const EMPTY = { title: '', open_date: '', link: '', hours: '' }

const normalizeLink = (raw) => {
  const s = (raw || '').trim()
  if (!s) return null
  return /^https?:\/\//i.test(s) ? s : `https://${s}`
}

const fmtHours = (h) => {
  const n = Number(h) || 0
  return Number.isInteger(n) ? String(n) : n.toFixed(1)
}

export default function Tracks() {
  const { user } = useAuth()
  const userId = user?.id ?? null
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    if (!userId) return
    const { data, error } = await supabase
      .from('track_items').select('*')
      .eq('user_id', userId).order('created_at')
    if (error) {
      console.error('[data] track_items load failed:', error)
      setError(error.message)
    } else {
      setItems(data || [])
      setError(null)
    }
    setLoading(false)
  }, [userId])

  useEffect(() => { load() }, [load])

  const addItem = async (category, form) => {
    const { data, error } = await supabase.from('track_items').insert({
      user_id: userId,
      category,
      title: form.title.trim(),
      open_date: form.open_date || null,
      link: normalizeLink(form.link),
      hours: Number(form.hours) || 0,
    }).select().single()
    if (error) { console.error('[data] track_items add failed:', error); setError(error.message); return false }
    setItems(prev => [...prev, data])
    return true
  }

  const updateItem = async (id, patch) => {
    const { data, error } = await supabase.from('track_items')
      .update(patch).eq('id', id).select().single()
    if (error) { console.error('[data] track_items update failed:', error); setError(error.message); return false }
    setItems(prev => prev.map(i => (i.id === id ? data : i)))
    return true
  }

  const deleteItem = async (item) => {
    if (!window.confirm(`Delete "${item.title}"?`)) return
    const { error } = await supabase.from('track_items').delete().eq('id', item.id)
    if (error) { console.error('[data] track_items delete failed:', error); setError(error.message); return }
    setItems(prev => prev.filter(i => i.id !== item.id))
  }

  return (
    <div className="tracks-page tracks-v2">
      <div className="tracks-v2-head">
        <div className="tracks-v2-title">Tracks</div>
        <div className="tracks-v2-sub">Programs, internships, volunteering and competitions.</div>
      </div>

      {error && <div className="tracks-v2-error">Couldn't save or load: {error}</div>}

      <div className="tracks-grid">
        {CELLS.map(cell => (
          <Cell key={cell.id} cell={cell} loading={loading}
            items={items.filter(i => i.category === cell.id)}
            onAdd={addItem} onUpdate={updateItem} onDelete={deleteItem} />
        ))}
      </div>
    </div>
  )
}

function Cell({ cell, items, loading, onAdd, onUpdate, onDelete }) {
  const [form, setForm] = useState(EMPTY)
  const [adding, setAdding] = useState(false)
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }))

  // Summer programs: soonest application date first, undated last.
  const sorted = cell.id === 'summer_program'
    ? [...items].sort((a, b) => (a.open_date || '9999').localeCompare(b.open_date || '9999'))
    : items

  const totalHours = items.reduce((a, i) => a + (Number(i.hours) || 0), 0)

  const submit = async () => {
    if (!form.title.trim()) return
    if (await onAdd(cell.id, form)) { setForm(EMPTY); setAdding(false) }
  }

  return (
    <section className="track-cell">
      <header className="track-cell-head">
        <span className="track-cell-pip" style={{ background: cell.color }} />
        <span className="track-cell-label">{cell.label}</span>
        <span className="track-cell-count">
          {cell.id === 'volunteering' ? `${fmtHours(totalHours)} hrs total` : items.length}
        </span>
      </header>

      <div className="track-cell-body">
        {loading && <div className="track-empty">Loading...</div>}
        {!loading && sorted.length === 0 && <div className="track-empty">Nothing here yet.</div>}
        {sorted.map(item => (
          <Row key={item.id} item={item} cell={cell} onUpdate={onUpdate} onDelete={onDelete} />
        ))}
      </div>

      {adding ? (
        <div className="track-form">
          <ItemFields cell={cell} form={form} set={set} onEnter={submit} autoFocus />
          <div className="track-form-actions">
            <button className="btn-ghost" onClick={() => { setAdding(false); setForm(EMPTY) }}>Cancel</button>
            <button className="btn-primary" onClick={submit}>Add</button>
          </div>
        </div>
      ) : (
        <button className="btn-add track-add" onClick={() => setAdding(true)}>+ Add</button>
      )}
    </section>
  )
}

function ItemFields({ cell, form, set, onEnter, autoFocus }) {
  const onKey = (e) => { if (e.key === 'Enter') onEnter() }
  return (
    <>
      <input autoFocus={autoFocus} placeholder={cell.placeholder}
        value={form.title} onChange={e => set('title', e.target.value)} onKeyDown={onKey} />
      {cell.fields.includes('open_date') && (
        <label className="track-field">
          <span>APPLICATION OPENS</span>
          <input type="date" value={form.open_date} onChange={e => set('open_date', e.target.value)} />
        </label>
      )}
      {cell.fields.includes('link') && (
        <input type="url" placeholder="Link (optional)"
          value={form.link} onChange={e => set('link', e.target.value)} onKeyDown={onKey} />
      )}
      {cell.fields.includes('hours') && (
        <label className="track-field">
          <span>HOURS SO FAR</span>
          <input type="number" min="0" step="0.5" placeholder="0"
            value={form.hours} onChange={e => set('hours', e.target.value)} onKeyDown={onKey} />
        </label>
      )}
    </>
  )
}

function Row({ item, cell, onUpdate, onDelete }) {
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState(EMPTY)
  const [addHours, setAddHours] = useState('')
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }))

  const startEdit = () => {
    setForm({
      title: item.title,
      open_date: item.open_date || '',
      link: item.link || '',
      hours: String(item.hours ?? ''),
    })
    setEditing(true)
  }

  const save = async () => {
    if (!form.title.trim()) return
    const ok = await onUpdate(item.id, {
      title: form.title.trim(),
      open_date: form.open_date || null,
      link: normalizeLink(form.link),
      hours: Number(form.hours) || 0,
    })
    if (ok) setEditing(false)
  }

  // Adds to the running total (negative numbers subtract, floor at 0).
  const logHours = async () => {
    const n = Number(addHours)
    if (!n) return
    const next = Math.max(0, (Number(item.hours) || 0) + n)
    if (await onUpdate(item.id, { hours: next })) setAddHours('')
  }

  if (editing) {
    return (
      <div className="track-form track-form-inline">
        <ItemFields cell={cell} form={form} set={set} onEnter={save} autoFocus />
        <div className="track-form-actions">
          <button className="btn-ghost" onClick={() => setEditing(false)}>Cancel</button>
          <button className="btn-primary" onClick={save}>Save</button>
        </div>
      </div>
    )
  }

  let dateChip = null
  if (cell.fields.includes('open_date')) {
    if (item.open_date) {
      const days = differenceInCalendarDays(parseISO(item.open_date), new Date())
      const cls = days <= 0 ? ' open' : days <= 14 ? ' soon' : ''
      const text = days <= 0 ? 'Open now' : `Opens ${format(parseISO(item.open_date), 'MMM d, yyyy')}`
      dateChip = <span className={`track-chip${cls}`}>{text}</span>
    } else {
      dateChip = <span className="track-chip muted">No date yet</span>
    }
  }

  return (
    <div className="track-row">
      <div className="track-row-main">
        <div className="track-row-title">{item.title}</div>
        <div className="track-row-meta">
          {dateChip}
          {item.link && (
            <a className="track-link" href={item.link} target="_blank" rel="noopener noreferrer">Open page ↗</a>
          )}
          {cell.fields.includes('hours') && (
            <span className="track-hours">{fmtHours(item.hours)} hrs</span>
          )}
        </div>
        {cell.fields.includes('hours') && (
          <div className="track-loghours">
            <input type="number" step="0.5" placeholder="+ hours"
              value={addHours} onChange={e => setAddHours(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && logHours()} />
            <button className="btn-ghost" onClick={logHours}>Log</button>
          </div>
        )}
      </div>
      <div className="track-row-actions">
        <button className="icon-btn" title="Edit" onClick={startEdit}>✎</button>
        <button className="icon-btn del" title="Delete" onClick={() => onDelete(item)}>✕</button>
      </div>
    </div>
  )
}