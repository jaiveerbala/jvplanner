import { useState, useEffect } from 'react'
import { format, parseISO, isPast } from 'date-fns'
import { useAuth } from '../lib/AuthContext'
import { getMilestones, createMilestone, updateMilestone, deleteMilestone } from '../lib/db'
import Modal from '../components/Modal'

const TRACKS = [
  { id: 'Summer Programs',   icon: '\u2600\ufe0f' },
  { id: 'Internship',        icon: '\ud83d\udcbc' },
  { id: 'Research',          icon: '\ud83d\udd2c' },
  { id: 'Project Portfolio', icon: '\ud83d\udcc1' },
  { id: 'Science Fairs',     icon: '\ud83c\udfc6' },
  { id: 'Leadership',        icon: '\u26a1' },
]

const STATUS_CYCLE = ['not-started', 'in-progress', 'done', 'applied']
const STATUS_LABELS = { 'not-started': 'Not started', 'in-progress': 'In progress', done: 'Done', applied: 'Applied' }

export default function Tracks() {
  const { user } = useAuth()
  const [milestones, setMilestones] = useState([])
  const [showMsModal, setShowMsModal] = useState(false)
  const [collapsedTracks, setCollapsedTracks] = useState({})
  const [gradeFilter, setGradeFilter] = useState('all')
  const [msForm, setMsForm] = useState({ title: '', track: 'Summer Programs', grade_year: 9, status: 'not-started', deadline: '', notes: '' })

  useEffect(() => {
    if (user) getMilestones(user.id).then(setMilestones)
  }, [user])

  const filteredMs = milestones.filter(m => gradeFilter === 'all' || m.grade_year === parseInt(gradeFilter))
  const toggleTrack = (id) => setCollapsedTracks(p => ({ ...p, [id]: !p[id] }))

  const cycleStatus = async (m) => {
    const next = STATUS_CYCLE[(STATUS_CYCLE.indexOf(m.status) + 1) % STATUS_CYCLE.length]
    const updated = await updateMilestone(m.id, { status: next })
    setMilestones(prev => prev.map(x => x.id === m.id ? updated : x))
  }

  const handleMsSave = async () => {
    if (!msForm.title.trim()) return
    const created = await createMilestone(user.id, { ...msForm, deadline: msForm.deadline || null })
    setMilestones(prev => [...prev, created])
    setShowMsModal(false)
    setMsForm({ title: '', track: 'Summer Programs', grade_year: 9, status: 'not-started', deadline: '', notes: '' })
  }

  const handleMsDelete = async (id) => {
    if (!window.confirm('Delete this milestone?')) return
    await deleteMilestone(id)
    setMilestones(prev => prev.filter(m => m.id !== id))
  }

  return (
    <div className="tracks-page">
      
      <div className="college-bottom tracks-open">
        <div className="college-bottom-header" >
          <div className="college-bottom-label">
            COLLEGE TRACK
            <span style={{ color: 'var(--t-4)', fontWeight: 400 }}>
              {milestones.length} milestones
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            {/* Grade filter */}
            <div style={{ display: 'flex', gap: 4 }} onClick={e => e.stopPropagation()}>
              {['all','9','10','11','12'].map(g => (
                <button
                  key={g}
                  onClick={() => setGradeFilter(g)}
                  style={{
                    background: gradeFilter === g ? 'var(--accent-dim)' : 'transparent',
                    border: '1px solid',
                    borderColor: gradeFilter === g ? 'var(--accent)' : 'var(--b-1)',
                    color: gradeFilter === g ? 'var(--accent-text)' : 'var(--t-3)',
                    fontFamily: 'var(--f-mono)',
                    fontSize: 9,
                    padding: '2px 8px',
                    borderRadius: 99,
                    cursor: 'pointer',
                    letterSpacing: '0.08em',
                  }}
                >
                  {g === 'all' ? 'All' : `${g}th`}
                </button>
              ))}
            </div>
            <button
              className="btn-primary"
              style={{ fontSize: 11, padding: '5px 10px' }}
              onClick={e => { e.stopPropagation(); setShowMsModal(true) }}
            >
              + Milestone
            </button>
            <span style={{ fontSize: 10, color: 'var(--t-3)' }}></span>
          </div>
        </div>

        {(
          <div className="college-bottom-body">
            {TRACKS.map(({ id, icon }) => {
              const items = filteredMs.filter(m => m.track === id)
              const isCollapsed = collapsedTracks[id]
              return (
                <div key={id} className={`track-section${isCollapsed ? ' collapsed' : ''}`}>
                  <div className="track-header" onClick={() => toggleTrack(id)}>
                    <span className="track-icon">{icon}</span>
                    <span className="track-name">{id}</span>
                    <span className="track-count">{items.length}</span>
                    <span className="track-chev">▼</span>
                  </div>
                  <div className="track-rows">
                    {items.map(m => {
                      const overdue = m.deadline && isPast(parseISO(m.deadline)) && m.status !== 'done'
                      return (
                        <div key={m.id} className="milestone-row">
                          <span className="milestone-row-title">{m.title}</span>
                          <span className="milestone-row-grade">{m.grade_year}th</span>
                          <button className={`status-btn ${m.status}`} onClick={() => cycleStatus(m)}>
                            {STATUS_LABELS[m.status]}
                          </button>
                          <span className={`milestone-row-deadline${overdue ? ' overdue' : ''}`}>
                            {m.deadline ? format(parseISO(m.deadline), 'MMM d, yy') : '—'}
                          </span>
                          <button className="ms-del-btn" onClick={() => handleMsDelete(m.id)}>✕</button>
                        </div>
                      )
                    })}
                    {items.length === 0 && (
                      <div style={{ padding: '8px 20px 8px 44px', fontSize: 11, color: 'var(--t-4)', fontStyle: 'italic' }}>
                        Nothing added yet.
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>


      {showMsModal && (
        <Modal title="New Milestone" onClose={() => setShowMsModal(false)}>
          <input autoFocus placeholder="Milestone title" value={msForm.title} onChange={e => setMsForm(p => ({ ...p, title: e.target.value }))} />
          <div className="form-row">
            <div className="form-group">
              <div className="form-label">TRACK</div>
              <select value={msForm.track} onChange={e => setMsForm(p => ({ ...p, track: e.target.value }))}>
                {TRACKS.map(t => <option key={t.id} value={t.id}>{t.id}</option>)}
              </select>
            </div>
            <div className="form-group">
              <div className="form-label">GRADE YEAR</div>
              <select value={msForm.grade_year} onChange={e => setMsForm(p => ({ ...p, grade_year: parseInt(e.target.value) }))}>
                <option value={9}>9th</option><option value={10}>10th</option>
                <option value={11}>11th</option><option value={12}>12th</option>
              </select>
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <div className="form-label">STATUS</div>
              <select value={msForm.status} onChange={e => setMsForm(p => ({ ...p, status: e.target.value }))}>
                {STATUS_CYCLE.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
              </select>
            </div>
            <div className="form-group">
              <div className="form-label">DEADLINE</div>
              <input type="date" value={msForm.deadline} onChange={e => setMsForm(p => ({ ...p, deadline: e.target.value }))} />
            </div>
          </div>
          <textarea placeholder="Notes..." value={msForm.notes} onChange={e => setMsForm(p => ({ ...p, notes: e.target.value }))} />
          <div className="modal-actions">
            <button className="btn-ghost" onClick={() => setShowMsModal(false)}>Cancel</button>
            <button className="btn-primary" onClick={handleMsSave}>Save</button>
          </div>
        </Modal>
      )}
    </div>
  )
}
