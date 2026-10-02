import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from './supabase'

const ALLOWED_EMAIL = 'jaiveerbala@gmail.com'

// If getSession() hasn't answered in this long, stop waiting and show the
// login screen. A login screen is recoverable; an infinite spinner is not.
// onAuthStateChange will correct us the moment the real session resolves.
const SESSION_TIMEOUT_MS = 8000

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
      if (u && u.email !== ALLOWED_EMAIL) {
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