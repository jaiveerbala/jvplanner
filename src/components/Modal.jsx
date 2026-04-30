import { useEffect } from 'react'

export default function Modal({ title, onClose, children, wide }) {
  useEffect(() => {
    const h = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={wide ? { maxWidth: 560 } : {}}>
        <div className="modal-title">{title}</div>
        {children}
      </div>
    </div>
  )
}
