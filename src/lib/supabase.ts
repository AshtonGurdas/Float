import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = url && anonKey
  ? createClient(url, anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        // The browser lock can leave a save or delete waiting forever when the
        // same account is open on a phone and a computer.
        lock: async <R,>(_name: string, _acquireTimeout: number, fn: () => Promise<R>) => fn(),
      },
    })
  : null
