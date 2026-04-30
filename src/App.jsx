import { useEffect, useState } from 'react'
import { AuthProvider, useAuth } from './lib/AuthContext'
import { seedIfEmpty } from './lib/db'
import Sidebar from './components/Sidebar'
import MobileNav from './components/MobileNav'
import Home from './pages/Home'
import CalendarTab from './pages/CalendarTab'
import College from './pages/College'
import Completed from './pages/Completed'

function AppInner() {
  const { user } = useAuth()
  const [tab, setTab] = useState('home')

  useEffect(() => {
    document.body.className = `tab-${tab}`
  }, [tab])

  useEffect(() => {
    if (user) seedIfEmpty(user.id)
  }, [user])

  if (user === undefined) {
    return (
      <div className="loading-page">
        <div className="loading-orb" />
        <div className="loading-label">LOADING</div>
      </div>
    )
  }

  if (!user) return <LoginPage />

  const renderPage = () => {
    if (tab === 'home')      return <Home onNavigate={setTab} />
    if (tab === 'college')   return <College />
    if (tab === 'completed') return <Completed />
    return <CalendarTab tab={tab} />
  }

  return (
    <div className="app">
      <Sidebar currentTab={tab} onNavigate={setTab} />
      <main className="main">
        {renderPage()}
      </main>
      <MobileNav currentTab={tab} onNavigate={setTab} />
    </div>
  )
}

function LoginPage() {
  const { signInWithGoogle } = useAuth()
  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-orb" />
        <div className="login-title">JVPLANNER</div>
        <div className="login-sub">Sign in once — stays logged in on every device automatically.</div>
        <button className="google-signin-btn" onClick={signInWithGoogle}>
          <GoogleIcon />
          Continue with Google
        </button>
      </div>
    </div>
  )
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
    </svg>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <AppInner />
    </AuthProvider>
  )
}
