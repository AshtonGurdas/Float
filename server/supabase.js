import { createClient } from '@supabase/supabase-js'

export function adminClient() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

export async function userFromRequest(client, request) {
  const header = request.headers.get('authorization') || ''
  const token = header.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() || ''
  if (!token) return null
  const { data, error } = await client.auth.getUser(token)
  if (error || !data.user) return null
  return data.user
}
