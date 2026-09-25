import { useState, type FormEvent } from 'react'
import { friendlyAuth } from '../lib/format.ts'
import { supabase } from '../lib/supabase.ts'

export function AuthScreen() {
  const [mode, setMode] = useState<'in' | 'up'>('in')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    if (!supabase) return
    setError(null)
    setNotice(null)
    if (!email.includes('@')) {
      setError('Enter the email for this shop.')
      return
    }
    if (password.length < 8) {
      setError('Use at least 8 characters.')
      return
    }
    setBusy(true)
    try {
      if (mode === 'up') {
        const response = await fetch('/api/signup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: email.trim(), password }),
        })
        const body = await response.json().catch(() => ({}))
        if (!response.ok) throw new Error(body.error || 'Could not create the account.')
        const { error: signError } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
        if (signError) throw signError
      } else {
        const { error: signError } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
        if (signError) throw signError
      }
    } catch (err) {
      setError(friendlyAuth(err instanceof Error ? err.message : 'Could not sign in.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="auth">
      <div className="auth-card">
        <p className="kicker">TCG shop</p>
        <h1>Float</h1>
        <p className="lede">
          Track what you spent and what you made, down to a single card or a case of boxes. Watch daily TCGplayer prices beside it.
        </p>
        <form onSubmit={onSubmit}>
          <label className="field">
            Email
            <input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} />
          </label>
          <label className="field">
            Password
            <input
              type="password"
              autoComplete={mode === 'up' ? 'new-password' : 'current-password'}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
          {error ? <p className="error-text">{error}</p> : null}
          {notice ? <p className="quiet">{notice}</p> : null}
          <button className="btn wide" type="submit" disabled={busy}>
            {busy ? 'Working…' : mode === 'up' ? 'Create account' : 'Sign in'}
          </button>
        </form>
        <button
          type="button"
          className="text-btn"
          onClick={() => {
            setMode(mode === 'up' ? 'in' : 'up')
            setError(null)
            setNotice(null)
          }}
        >
          {mode === 'up' ? 'Already have an account? Sign in' : 'New shop books? Create an account'}
        </button>

      </div>
    </main>
  )
}

export function ConfigMissing() {
  return (
    <main className="auth">
      <div className="auth-card">
        <p className="kicker">Setup</p>
        <h1>Float</h1>
        <p className="lede">The database keys are missing, so your books cannot be saved yet.</p>
      </div>
    </main>
  )
}
