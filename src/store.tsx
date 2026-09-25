import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { quotesFor, refreshPrices, type CatalogProduct, type Quote } from './lib/api.ts'
import type { Entry } from './lib/books.ts'
import { quoteKey } from './lib/market.ts'
import { entryFromRow, entryToRow, watchFromRow, type EntryInput, type Watch } from './lib/rows.ts'
import { supabase } from './lib/supabase.ts'

export type Draft =
  | { mode: 'create'; preset?: Partial<Entry> & { attachedName?: string; prices?: CatalogProduct['prices'] } }
  | { mode: 'edit'; entry: Entry }
  | { mode: 'sell'; buy: Entry }

type ShopValue = {
  entries: Entry[]
  watch: Watch[]
  quotes: Record<string, Quote>
  loading: boolean
  error: string | null
  setError: (message: string | null) => void
  draft: Draft | null
  openDraft: (draft: Draft) => void
  closeDraft: () => void
  saveEntry: (input: EntryInput, id?: string) => Promise<void>
  deleteEntry: (id: string) => Promise<void>
  watchProduct: (product: CatalogProduct, subtype: string) => Promise<void>
  unwatch: (id: string) => Promise<void>
  refreshMarket: () => Promise<void>
  quoteFor: (productId: number | null, subtype: string | null) => Quote | undefined
}

const ShopContext = createContext<ShopValue | null>(null)

function byDate(a: Entry, b: Entry) {
  const date = b.occurredOn.localeCompare(a.occurredOn)
  if (date) return date
  return b.createdAt.localeCompare(a.createdAt)
}

function quoteItems(entries: Entry[], watch: Watch[]) {
  const seen = new Set<string>()
  const items: { productId: number; subtype: string }[] = []
  for (const item of watch) {
    const key = quoteKey(item.productId, item.subtype)
    if (seen.has(key)) continue
    seen.add(key)
    items.push({ productId: item.productId, subtype: item.subtype })
  }
  for (const entry of entries) {
    if (!entry.productId || !entry.subtype) continue
    const key = quoteKey(entry.productId, entry.subtype)
    if (seen.has(key)) continue
    seen.add(key)
    items.push({ productId: entry.productId, subtype: entry.subtype })
  }
  return items
}

export function ShopProvider({ session, children }: { session: Session; children: ReactNode }) {
  const [entries, setEntries] = useState<Entry[]>([])
  const [watch, setWatch] = useState<Watch[]>([])
  const [quotes, setQuotes] = useState<Record<string, Quote>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const userId = session.user.id

  const mergeQuotes = useCallback((items: Quote[]) => {
    setQuotes((current) => {
      const next = { ...current }
      for (const item of items) next[quoteKey(item.productId, item.subtype)] = item
      return next
    })
  }, [])

  const loadQuotes = useCallback(async (items: { productId: number; subtype: string }[]) => {
    if (!items.length) return
    const data = await quotesFor(items)
    mergeQuotes(data.items)
  }, [mergeQuotes])

  const load = useCallback(async () => {
    if (!supabase) return
    setLoading(true)
    const [entryRes, watchRes] = await Promise.all([
      supabase.from('entries').select('*').order('occurred_on', { ascending: false }).limit(2000),
      supabase.from('watchlist').select('*').order('created_at', { ascending: false }),
    ])
    if (entryRes.error) throw new Error(entryRes.error.message)
    if (watchRes.error) throw new Error(watchRes.error.message)
    const nextEntries = ((entryRes.data || []) as Parameters<typeof entryFromRow>[0][]).map(entryFromRow).sort(byDate)
    const nextWatch = ((watchRes.data || []) as Parameters<typeof watchFromRow>[0][]).map(watchFromRow)
    setEntries(nextEntries)
    setWatch(nextWatch)
    setLoading(false)
    try {
      await loadQuotes(quoteItems(nextEntries, nextWatch))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Prices did not load.')
    }
  }, [loadQuotes])

  useEffect(() => {
    let live = true
    load().catch((err: unknown) => {
      if (!live) return
      setLoading(false)
      setError(err instanceof Error ? err.message : 'Your books did not load.')
    })
    return () => {
      live = false
    }
  }, [load])

  const saveEntry = useCallback(async (input: EntryInput, id?: string) => {
    if (!supabase) throw new Error('Supabase is not configured.')
    const row = entryToRow(input, userId)
    const query = id
      ? supabase.from('entries').update(row).eq('id', id).select('*').single()
      : supabase.from('entries').insert(row).select('*').single()
    const { data, error: saveError } = await query
    if (saveError) throw new Error(saveError.message)
    const next = entryFromRow(data as Parameters<typeof entryFromRow>[0])
    setEntries((current) => {
      const without = current.filter((entry) => entry.id !== next.id)
      return [next, ...without].sort(byDate)
    })
    if (next.productId && next.subtype) {
      loadQuotes([{ productId: next.productId, subtype: next.subtype }]).catch(() => {})
    }
  }, [loadQuotes, userId])

  const deleteEntry = useCallback(async (id: string) => {
    if (!supabase) throw new Error('Supabase is not configured.')
    const { error: deleteError } = await supabase.from('entries').delete().eq('id', id)
    if (deleteError) {
      if (/foreign key|restrict/i.test(deleteError.message)) {
        throw new Error('Delete the sales of this purchase first.')
      }
      throw new Error(deleteError.message)
    }
    setEntries((current) => current.filter((entry) => entry.id !== id))
  }, [])

  const watchProduct = useCallback(async (product: CatalogProduct, subtype: string) => {
    if (!supabase) throw new Error('Supabase is not configured.')
    const { data, error: watchError } = await supabase
      .from('watchlist')
      .insert({
        user_id: userId,
        product_id: product.productId,
        subtype,
        name: product.name,
        set_name: product.setName,
        image_url: product.imageUrl,
        sealed: product.sealed,
        game_key: product.game,
        tcg_url: product.url,
      })
      .select('*')
      .single()
    if (watchError) throw new Error(watchError.message)
    const next = watchFromRow(data as Parameters<typeof watchFromRow>[0])
    setWatch((current) => [next, ...current.filter((item) => item.id !== next.id)])
    try {
      await refreshPrices([{ productId: product.productId, subtype }])
      await loadQuotes([{ productId: product.productId, subtype }])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The price did not refresh.')
    }
  }, [loadQuotes, userId])

  const unwatch = useCallback(async (id: string) => {
    if (!supabase) throw new Error('Supabase is not configured.')
    const { error: watchError } = await supabase.from('watchlist').delete().eq('id', id)
    if (watchError) throw new Error(watchError.message)
    setWatch((current) => current.filter((item) => item.id !== id))
  }, [])

  const refreshMarket = useCallback(async () => {
    await refreshPrices()
    await loadQuotes(quoteItems(entries, watch))
  }, [entries, loadQuotes, watch])

  const quoteFor = useCallback((productId: number | null, subtype: string | null) => {
    if (!productId || !subtype) return undefined
    return quotes[quoteKey(productId, subtype)]
  }, [quotes])

  const value = useMemo<ShopValue>(() => ({
    entries,
    watch,
    quotes,
    loading,
    error,
    setError,
    draft,
    openDraft: setDraft,
    closeDraft: () => setDraft(null),
    saveEntry,
    deleteEntry,
    watchProduct,
    unwatch,
    refreshMarket,
    quoteFor,
  }), [entries, watch, quotes, loading, error, draft, saveEntry, deleteEntry, watchProduct, unwatch, refreshMarket, quoteFor])

  return <ShopContext.Provider value={value}>{children}</ShopContext.Provider>
}

export function useShop() {
  const value = useContext(ShopContext)
  if (!value) throw new Error('Shop data is only available once you are signed in.')
  return value
}
