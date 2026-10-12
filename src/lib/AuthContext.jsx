import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from './supabase'

// The app owner. Only this account gets the starter content (college
// milestones, summer program list) seeded on first login.
export const OWNER_EMAIL = 'jaiveerbala@gmail.com'

// Everyone who may sign in. Each account only ever sees its own data
// (enforced by row-level security in Supabase, not by the app).
// Emails must be lowercase.
const ALLOWED_EMAILS = [
  OWNER_EMAIL,
  'danielmpashkevich@gmail.com',
]

// If getSession() hasn't answered in this long, stop waiting and show the
// login screen. A login screen is recoverable; an infinite spinner is not.
// onAuthStateChange will correct us the moment the real session resolves.
const SESSION_TIMEOUT_MS = 8000

// First + last initial from the Google account name ("DP" for Daniel
// Pashkevich), falling back to the email's first letter. The owner keeps
// the original "JV" (first + last would give "JB").
export function userInitials(user) {
  if (user?.email === OWNER_EMAIL) return 'JV'
  const meta = user?.user_metadata || {}
  const parts = (meta.full_name || meta.name || '').trim().split(/\s+/).filter(Boolean)
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
  if (parts.length === 1) return parts[0][0].toUpperCase()
  return (user?.email || '?')[0].toUpperCase()
}

// Login screen has no account yet, so it shows the name of whoever last
// signed in on this device (stored locally), or plain "PLANNER" the first time.
const BRAND_KEY = 'planner_brand'
export function lastBrand() {
  try { return localStorage.getItem(BRAND_KEY) || 'PLANNER' } catch { return 'PLANNER' }
}
export function plannerBrand(user) {
  const brand = `${userInitials(user)}PLANNER`
  try { localStorage.setItem(BRAND_KEY, brand) } catch { /* private mode */ }
  return brand
}

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(undefined)

  useEffect(() => {
    let cancelled = false
    let settled = false

    const apply = (session) => {
      if (cancelled) return
      settled = true
      const u = session?.user ?? null
      if (u && !ALLOWED_EMAILS.includes((u.email || '').toLowerCase())) {
        supabase.auth.signOut()
        setUser(null)
      } else {
        setUser(u)
      }
    }

    // Initial session read, with a hard timeout so we can never hang here.
    supabase.auth.getSession()
      .then(({ data: { session } }) => apply(session))
      .catch((err) => {
        console.error('[auth] getSession failed:', err)
        if (!cancelled) { settled = true; setUser(null) }
      })

    const timer = setTimeout(() => {
      if (!settled && !cancelled) {
        console.warn('[auth] getSession timed out — falling back to signed-out')
        setUser(null)
      }
    }, SESSION_TIMEOUT_MS)

    // Fires for INITIAL_SESSION, SIGNED_IN, SIGNED_OUT, TOKEN_REFRESHED.
    // This is what un-sticks us if the initial read timed out.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => apply(session)
    )

    return () => {
      cancelled = true
      clearTimeout(timer)
      subscription.unsubscribe()
    }
  }, [])

  const signInWithGoogle = () =>
    supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: 'https://jaiveerbala.github.io/jvplanner' }
    })

  const signOut = () => supabase.auth.signOut()

  return (
    <AuthContext.Provider value={{ user, signInWithGoogle, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)