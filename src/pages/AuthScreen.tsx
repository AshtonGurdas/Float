import { useState, type FormEvent } from 'react'
import { friendlyAuth } from '../lib/format.ts'
import { supabase } from '../lib/supabase.ts'

function cleanEmail(value: string) {
  return value.replace(/[\u200b\u200c\u200d\ufeff]/g, '').trim().toLowerCase()
}

function cleanPassword(value: string) {
  return value.replace(/[\u200b\u200c\u200d\ufeff]/g, '')
}

export function AuthScreen() {
  const [mode, setMode] = useState<'in' | 'up'>('in')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase) return
    const data = new FormData(event.currentTarget)
    const email = cleanEmail(String(data.get('email') || ''))
    const password = cleanPassword(String(data.get('password') || ''))
    setError(null)
    if (!email.includes('@') || !email.includes('.')) {
      setError('Enter the full email for this shop.')
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
          body: JSON.stringify({ email, password }),
        })
        const body = await response.json().catch(() => ({}))
        if (!response.ok) throw new Error(body.error || 'Could not create the account.')
      }
      const { error: signError } = await supabase.auth.signInWithPassword({ email, password })
      if (signError) throw signError
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
          One login for your phone, laptop, and computer. The books stay in the account, not on the device.
        </p>
        <div className="seg" role="group" aria-label="Account action">
          <button type="button" aria-pressed={mode === 'in'} onClick={() => { setMode('in'); setError(null) }}>Sign in</button>
          <button type="button" aria-pressed={mode === 'up'} onClick={() => { setMode('up'); setError(null) }}>Create account</button>
        </div>
        <form onSubmit={onSubmit} autoComplete="on">
          <label className="field">
            Email
            <input
              name="email"
              type="email"
              inputMode="email"
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="next"
            />
          </label>
          <label className="field">
            Password
            <span className="password-row">
              <input
                name="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete={mode === 'up' ? 'new-password' : 'current-password'}
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                enterKeyHint="go"
              />
              <button type="button" className="btn ghost" onClick={() => setShowPassword((open) => !open)}>
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </span>
          </label>
          {error ? <p className="error-text">{error}</p> : null}
          <button className="btn wide" type="submit" disabled={busy}>
            {busy ? 'Working…' : mode === 'up' ? 'Create account' : 'Sign in'}
          </button>
        </form>
        <p className="quiet">
          {mode === 'in'
            ? 'Use the same email and password you created on the computer. Tap Show if the phone changed a letter.'
            : 'Only create an account if you have never signed up. If you already did, switch to Sign in.'}
        </p>
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
