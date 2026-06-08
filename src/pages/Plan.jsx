import { useState, useEffect } from 'react'
import { useAuth } from '../lib/AuthContext'
import { supabase } from '../lib/supabase'

const SECTIONS = [
  { id: 'summer', label: 'Summer', icon: '☀️' }
]

export default function Plan() {
  const { user } = useAuth()
  const [items, setItems] = useState([])
  const [newText, setNewText] = useState('')
  const [activeSection, setActiveSection] = useState('summer')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) return
    load()
  }, [user])

  const load = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('plan_items')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true })
    setItems(data || [])
    setLoading(false)
  }

  const handleAdd = async () => {
    if (!newText.trim()) return
    const { data } = await supabase
      .from('plan_items')
      .insert({ user_id: user.id, text: newText.trim(), section: activeSection })
      .select().single()
    if (data) setItems(prev => [...prev, data])
    setNewText('')
  }

  const handleDelete = async (id) => {
    await supabase.from('plan_items').delete().eq('id', id)
    setItems(prev => prev.filter(i => i.id !== id))
  }

  const sectionItems = items.filter(i => i.section === activeSection)

  return (
    <div style={{ height: '100%', overflowY: 'auto', padding: '36px 48px', maxWidth: 760 }}>
      <div style={{ marginBottom: 32 }}>
        <div style={{ fontFamily: 'var(--f-display)', fontSize: 22, fontWeight: 700, letterSpacing: '-0.01em', marginBottom: 6 }}>
          Plan
        </div>
        <div style={{ fontFamily: 'var(--f-mono)', fontSize: 11, color: 'var(--t-3)', letterSpacing: '0.06em' }}>
          General reminders and things to get done — separate from your todos.
        </div>
      </div>

      {/* Section tabs */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 28 }}>
        {SECTIONS.map(s => (
          <button
            key={s.id}
            onClick={() => setActiveSection(s.id)}
            style={{
              background: activeSection === s.id ? 'var(--accent-dim)' : 'transparent',
              border: `1px solid ${activeSection === s.id ? 'var(--accent)' : 'var(--b-2)'}`,
              color: activeSection === s.id ? 'var(--accent-text)' : 'var(--t-2)',
              fontFamily: 'var(--f-display)',
              fontSize: 12, padding: '7px 16px',
              borderRadius: 8, cursor: 'pointer',
              transition: 'all 0.15s',
              display: 'flex', alignItems: 'center', gap: 6,
            }}
          >
            <span>{s.icon}</span>
            <span>{s.label}</span>
          </button>
        ))}
      </div>

      {/* Add input */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        <input
          type="text"
          placeholder={`Add something to ${SECTIONS.find(s => s.id === activeSection)?.label}...`}
          value={newText}
          onChange={e => setNewText(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleAdd()}
          style={{ flex: 1 }}
        />
        <button className="btn-primary" onClick={handleAdd}>Add</button>
      </div>

      {/* Items list */}
      {loading ? (
        <div style={{ color: 'var(--t-3)', fontSize: 12, fontStyle: 'italic' }}>Loading...</div>
      ) : sectionItems.length === 0 ? (
        <div style={{ color: 'var(--t-3)', fontSize: 13, fontStyle: 'italic' }}>Nothing here yet.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {sectionItems.map(item => (
            <div key={item.id} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '11px 14px',
              background: 'var(--bg-2)',
              border: '1px solid var(--b-1)',
              borderRadius: 8,
              transition: 'border-color 0.15s',
            }}
              onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--b-2)'}
              onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--b-1)'}
            >
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)', flexShrink: 0 }} />
              <div style={{ flex: 1, fontSize: 13, color: 'var(--t-1)' }}>{item.text}</div>
              <button
                onClick={() => handleDelete(item.id)}
                style={{ background: 'none', border: 'none', color: 'var(--t-4)', cursor: 'pointer', fontSize: 13, padding: '0 2px', transition: 'color 0.12s', lineHeight: 1 }}
                onMouseEnter={e => e.target.style.color = '#f87171'}
                onMouseLeave={e => e.target.style.color = 'var(--t-4)'}
              >✕</button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
