import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { Shell } from './components/Shell.tsx'
import { AuthScreen, ConfigMissing } from './pages/AuthScreen.tsx'
import { supabase } from './lib/supabase.ts'
import { ShopProvider } from './store.tsx'

function useTheme() {
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    const saved = localStorage.getItem('float.theme')
    return saved === 'light' ? 'light' : 'dark'
  })
  useEffect(() => {
    document.documentElement.dataset.theme = theme
    localStorage.setItem('float.theme', theme)
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'light' ? '#f6f3ec' : '#101210')
    document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]')?.setAttribute('content', theme === 'dark' ? 'black' : 'default')
  }, [theme])
  return [theme, setTheme] as const
}

export default function App() {
  const [theme, setTheme] = useTheme()
  const [session, setSession] = useState<Session | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (!supabase) return
    let live = true
    supabase.auth.getSession().then(({ data }) => {
      if (!live) return
      setSession(data.session)
      setReady(true)
    })
    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      window.setTimeout(() => {
        if (!live) return
        setSession(next)
        setReady(true)
      }, 0)
    })
    return () => {
      live = false
      data.subscription.unsubscribe()
    }
  }, [])

  if (!supabase) return <ConfigMissing />
  if (!ready) {
    return (
      <main className="auth">
        <p className="quiet">Opening your books…</p>
      </main>
    )
  }
  if (!session) return <AuthScreen />
  return (
    <ShopProvider session={session}>
      <Shell session={session} theme={theme} setTheme={setTheme} />
    </ShopProvider>
  )
}
