import { supabase } from './supabase.ts'

export type PriceQuote = {
  subtype: string
  market: number | null
  low: number | null
  mid: number | null
  high: number | null
  updatedOn: string | null
}

export type CatalogProduct = {
  productId: number
  categoryId: number
  groupId: number
  game: string
  name: string
  setName: string | null
  imageUrl: string | null
  url: string | null
  number: string | null
  rarity: string | null
  sealed: boolean
  prices: PriceQuote[]
}

export type Quote = {
  productId: number
  subtype: string
  name: string
  setName: string | null
  imageUrl: string | null
  url: string | null
  sealed: boolean
  game: string | null
  number: string | null
  market: number | null
  low: number | null
  mid: number | null
  previous: number | null
  change: number | null
  updatedOn: string | null
  history: { date: string; market: number }[]
}

export type SetHit = {
  groupId: number
  name: string
  abbreviation?: string | null
  publishedOn?: string | null
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  if (!supabase) throw new Error('Supabase is not configured.')
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new Error('Sign in required.')
  const response = await fetch(path, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(init?.headers || {}),
    },
  })
  const body = (await response.json().catch(() => ({}))) as { error?: string }
  if (!response.ok) throw new Error(body.error || 'Request failed.')
  return body as T
}

export function searchProducts(game: string, q: string, filter: 'all' | 'card' | 'sealed') {
  return call<{
    results: CatalogProduct[]
    sets: SetHit[]
    loadedSet: string | null
    note: string | null
    remainingSets: number
    shouldContinue: boolean
  }>('/api/search', {
    method: 'POST',
    body: JSON.stringify({ game, q, filter }),
  })
}

export function picturesFor(items: { id: string; title: string; detail: string }[]) {
  return call<{ items: { id: string; imageUrl: string; name: string; setName: string | null }[] }>('/api/pictures', {
    method: 'POST',
    body: JSON.stringify({ items }),
  })
}

export function latestSealed(game: string) {
  return call<{ results: CatalogProduct[]; sets: SetHit[] }>(`/api/latest?game=${encodeURIComponent(game)}`)
}

export function productDetail(id: number, subtype: string | null) {
  const query = new URLSearchParams({ id: String(id) })
  if (subtype) query.set('subtype', subtype)
  return call<{
    product: CatalogProduct
    subtype: string
    history: { date: string; market: number }[]
    previous: number | null
    market: number | null
    updatedOn: string | null
  }>(`/api/product?${query}`)
}

export function quotesFor(items: { productId: number; subtype: string }[]) {
  return call<{ items: Quote[] }>('/api/quotes', {
    method: 'POST',
    body: JSON.stringify({ items }),
  })
}

export function refreshPrices(items?: { productId: number; subtype: string }[]) {
  return call<{ updated: number }>('/api/prices/refresh', {
    method: 'POST',
    body: JSON.stringify(items ? { items } : {}),
  })
}
