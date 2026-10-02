import { createClient } from '@supabase/supabase-js'

/**
 * A no-op lock.
 *
 * supabase-js normally guards token refresh with navigator.locks so that
 * multiple tabs don't refresh at once. The problem: if ANY tab or the
 * installed PWA holds that lock and then gets frozen by the OS (backgrounded
 * phone, suspended tab), every other instance blocks on getSession() forever
 * and the app sits on the loading screen until the lock happens to free up.
 *
 * For a single-user app the worst case without the lock is two refreshes
 * firing at once, which is harmless. An app that never loads is not.
 */
const noLock = async (_name, _acquireTimeout, fn) => fn()

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
  {
    auth: {
      flowType: 'pkce',
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      lock: noLock,
    },
  }
)