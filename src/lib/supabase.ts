import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !anonKey) {
  throw new Error(
    'Supabase is not configured. Copy .env.example to .env.local and fill in ' +
      'VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.',
  )
}

/**
 * Where the session is kept — the same key in every module on app.cyrix.in,
 * so signing in or out in one tab shows up here as a change to it.
 */
export const SESSION_KEY = `sb-${new URL(url).hostname.split('.')[0]}-auth-token`

export const supabase = createClient(url, anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
})

/**
 * Ecodes are the login id, but Supabase Auth needs an email. We map
 * E1042 -> e1042@cyrix.local. The address never receives mail; it is
 * purely an internal identifier so we get real JWTs and working RLS.
 */
const AUTH_DOMAIN = import.meta.env.VITE_AUTH_EMAIL_DOMAIN || 'cyrix.local'

export const ecodeToEmail = (ecode: string) =>
  `${ecode.trim().toLowerCase()}@${AUTH_DOMAIN}`

/** Turns Postgres exceptions from our RPCs into something readable. */
export function friendlyError(err: unknown): string {
  if (!err) return 'Something went wrong.'
  const msg =
    typeof err === 'string'
      ? err
      : (err as { message?: string }).message ?? String(err)

  if (msg.includes('Invalid login credentials')) {
    return 'Wrong employee code or password.'
  }
  // Signed out in another tab, or the session ran out: the call went out
  // as nobody, and nothing of My Task answers nobody.
  if (/permission denied for function|JWT expired|invalid JWT/i.test(msg)) {
    return 'You are no longer signed in. Sign in again on the Cyrix portal, then try once more.'
  }
  if (msg.includes('row-level security') || msg.includes('Not permitted')) {
    return 'You do not have access to this.'
  }
  if (/Failed to fetch|NetworkError|Load failed/i.test(msg)) {
    return 'No connection. Check the internet on this device and try again.'
  }
  // Our functions raise plain-English messages; strip the Postgres prefix.
  return msg.replace(/^(ERROR|error):\s*/i, '')
}
