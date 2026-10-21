import type { Session } from '@supabase/supabase-js'
import { useEffect, useState } from 'react'
import { IconBooks, IconEvents, IconMarket, IconPlus, IconProfit, IconReleases, IconShops, IconStock } from '../icons.tsx'
import { parseRoute, sectionOf, type Route } from '../lib/route.ts'
import { supabase } from '../lib/supabase.ts'
import { useShop } from '../store.tsx'
import { EntrySheet } from './EntrySheet.tsx'
import { BooksPage } from '../pages/Books.tsx'
import { Estimate } from './Estimate.tsx'
import { InventoryPage } from '../pages/Inventory.tsx'
import { MarketPage } from '../pages/Market.tsx'
import { EventsPage } from '../pages/Events.tsx'
import { ReleasesPage } from '../pages/Releases.tsx'
import { ShopsPage } from '../pages/Shops.tsx'
import { ProductPage } from '../pages/Product.tsx'

export function Shell({
  session,
  theme,
  setTheme,
}: {
  session: Session
  theme: 'dark' | 'light'
  setTheme: (theme: 'dark' | 'light') => void
}) {
  const { error, setError, openDraft } = useShop()
  const [route, setRoute] = useState<Route>(() => parseRoute(location.hash))

  useEffect(() => {
    const onHash = () => setRoute(parseRoute(location.hash))
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  const section = sectionOf(route)
  const email = session.user.email || 'Signed in'

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">Float</span>
          <span className="brand-sub">TCG shop</span>
        </div>
        <nav className="side-nav" aria-label="Sections">
          <a className={section === 'books' ? 'is-active' : ''} href="#/" aria-current={section === 'books' ? 'page' : undefined}>
            <IconBooks /> Books
          </a>
          <a className={section === 'profit' ? 'is-active' : ''} href="#/profit" aria-current={section === 'profit' ? 'page' : undefined}>
            <IconProfit /> <span>Profit calculator</span>
          </a>
          <a className={section === 'market' ? 'is-active' : ''} href="#/market" aria-current={section === 'market' ? 'page' : undefined}>
            <IconMarket /> Market
          </a>
          <a className={section === 'inventory' ? 'is-active' : ''} href="#/inventory" aria-current={section === 'inventory' ? 'page' : undefined}>
            <IconStock /> Stock
          </a>
          <a className={section === 'shops' ? 'is-active' : ''} href="#/shops" aria-current={section === 'shops' ? 'page' : undefined}>
            <IconShops /> People
          </a>
          <a className={section === 'events' ? 'is-active' : ''} href="#/events" aria-current={section === 'events' ? 'page' : undefined}>
            <IconEvents /> Events
          </a>
          <a className={section === 'releases' ? 'is-active' : ''} href="#/releases" aria-current={section === 'releases' ? 'page' : undefined}>
            <IconReleases /> Releases
          </a>
        </nav>
        <div className="side-foot">
          <button type="button" className="text-btn" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
            {theme === 'dark' ? 'Light mode' : 'Dark mode'}
          </button>
          <p className="quiet">{email}</p>
          <button type="button" className="text-btn" onClick={() => { void supabase?.auth.signOut() }}>Sign out</button>
        </div>
      </aside>
      <div className="content">
        {error ? (
          <div className="banner" role="status">
            <span>{error}</span>
            <button type="button" className="text-btn" onClick={() => setError(null)}>Dismiss</button>
          </div>
        ) : null}
        {route.name === 'books' ? <BooksPage /> : null}
        {route.name === 'profit' ? <Estimate /> : null}
        {route.name === 'market' ? <MarketPage /> : null}
        {route.name === 'inventory' ? <InventoryPage /> : null}
        {route.name === 'shops' ? <ShopsPage /> : null}
        {route.name === 'events' ? <EventsPage /> : null}
        {route.name === 'releases' ? <ReleasesPage /> : null}
        {route.name === 'product' ? <ProductPage productId={route.productId} subtype={route.subtype} /> : null}
      </div>
      <nav className="tabbar" aria-label="Sections">
        <a className={section === 'books' ? 'is-active' : ''} href="#/" aria-current={section === 'books' ? 'page' : undefined}>
          <IconBooks /> Books
        </a>
        <a className={section === 'profit' ? 'is-active tab-wide' : 'tab-wide'} href="#/profit" aria-current={section === 'profit' ? 'page' : undefined}>
          <IconProfit /> Profit calculator
        </a>
        <a className={section === 'market' ? 'is-active' : ''} href="#/market" aria-current={section === 'market' ? 'page' : undefined}>
          <IconMarket /> Market
        </a>
        <a className={section === 'inventory' ? 'is-active' : ''} href="#/inventory" aria-current={section === 'inventory' ? 'page' : undefined}>
          <IconStock /> Stock
        </a>
        <a className={section === 'shops' ? 'is-active' : ''} href="#/shops" aria-current={section === 'shops' ? 'page' : undefined}>
          <IconShops /> People
        </a>
        <a className={section === 'events' ? 'is-active' : ''} href="#/events" aria-current={section === 'events' ? 'page' : undefined}>
          <IconEvents /> Events
        </a>
        <a className={section === 'releases' ? 'is-active' : ''} href="#/releases" aria-current={section === 'releases' ? 'page' : undefined}>
          <IconReleases /> Releases
        </a>
        <button type="button" onClick={() => openDraft({ mode: 'create' })}>
          <IconPlus /> Add
        </button>
      </nav>
      <EntrySheet />
    </div>
  )
}
