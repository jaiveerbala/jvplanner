import { useState } from 'react'
import Modal from './Modal'
import { format } from 'date-fns'

const EMPTY = {
  title: '',
  notes: '',
  tab: 'general',
  start_date: format(new Date(), 'yyyy-MM-dd'),
  start_time: '',
  duration_hours: '',
  duration_mins: '',
  recurrence: 'none',
  recurrence_end: '',
  is_meeting: false,
}

export default function EventModal({ onSave, onClose, initialDate, forcedTab }) {
  const [form, setForm] = useState({
    ...EMPTY,
    start_date: initialDate || EMPTY.start_date,
    tab: forcedTab || EMPTY.tab,
  })

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }))

  const handleSave = () => {
    if (!form.title.trim() || !form.start_date) return
    const hours = parseInt(form.duration_hours) || 0
    const mins = parseInt(form.duration_mins) || 0
    const duration_minutes = hours * 60 + mins
    onSave({
      ...form,
      duration_minutes,
      duration_hours: undefined,
      duration_mins: undefined,
      recurrence_end: form.recurrence_end || null,
      completed: false,
      source: 'manual',
    })
  }

  return (
    <Modal title="New Task / Event" onClose={onClose}>
      {/* Title + meeting checkbox on same row */}
      <div className="form-group">
        <div className="form-label">TITLE</div>
        <input autoFocus value={form.title} onChange={e => set('title', e.target.value)} placeholder="What is it?" />
      </div>

      {/* Meeting toggle */}
      <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', userSelect: 'none' }}>
        <div
          onClick={() => set('is_meeting', !form.is_meeting)}
          style={{
            width: 16, height: 16,
            border: `1.5px solid ${form.is_meeting ? 'var(--accent)' : 'var(--b-3)'}`,
            borderRadius: 4,
            background: form.is_meeting ? 'var(--accent)' : 'transparent',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
            transition: 'all 0.15s',
          }}
        >
          {form.is_meeting && (
            <div style={{
              width: 8, height: 5,
              borderLeft: '2px solid #0c1714',
              borderBottom: '2px solid #0c1714',
              transform: 'rotate(-45deg) translate(1px,-1px)',
            }} />
          )}
        </div>
        <span style={{ fontSize: 12, color: form.is_meeting ? 'var(--accent-text)' : 'var(--t-2)' }}>
          This is a meeting
        </span>
      </label>

      {!forcedTab && (
        <div className="form-group">
          <div className="form-label">CALENDAR</div>
          <select value={form.tab} onChange={e => set('tab', e.target.value)}>
            <option value="general">General</option>
            <option value="school">School</option>
            <option value="college">College</option>
          </select>
        </div>
      )}

      <div className="form-row">
        <div className="form-group">
          <div className="form-label">DATE</div>
          <input type="date" value={form.start_date} onChange={e => set('start_date', e.target.value)} />
        </div>
        <div className="form-group">
          <div className="form-label">TIME</div>
          <input type="time" value={form.start_time} onChange={e => set('start_time', e.target.value)} />
        </div>
      </div>

      {/* Duration: hours + minutes */}
      <div className="form-group">
        <div className="form-label">DURATION</div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            type="number"
            value={form.duration_hours}
            onChange={e => set('duration_hours', e.target.value)}
            placeholder="0"
            min="0"
            style={{ width: '100%' }}
          />
          <span style={{ color: 'var(--t-3)', fontSize: 12, flexShrink: 0 }}>hr</span>
          <input
            type="number"
            value={form.duration_mins}
            onChange={e => set('duration_mins', e.target.value)}
            placeholder="0"
            min="0"
            max="59"
            style={{ width: '100%' }}
          />
          <span style={{ color: 'var(--t-3)', fontSize: 12, flexShrink: 0 }}>min</span>
        </div>
      </div>

      <div className="form-group">
        <div className="form-label">REPEATS</div>
        <select value={form.recurrence} onChange={e => set('recurrence', e.target.value)}>
          <option value="none">Does not repeat</option>
          <option value="daily">Daily</option>
          <option value="weekly">Weekly</option>
          <option value="monthly">Monthly</option>
        </select>
      </div>

      {form.recurrence !== 'none' && (
        <div className="form-group">
          <div className="form-label">REPEAT UNTIL</div>
          <input type="date" value={form.recurrence_end} onChange={e => set('recurrence_end', e.target.value)} />
        </div>
      )}

      <div className="form-group">
        <div className="form-label">NOTES</div>
        <textarea value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Optional notes..." />
      </div>

      <div className="modal-actions">
        <button className="btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn-primary" onClick={handleSave}>Add Task</button>
      </div>
    </Modal>
  )
}
