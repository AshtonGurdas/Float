import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { quotesFor, refreshPrices, type CatalogProduct, type Quote } from './lib/api.ts'
import type { Entry } from './lib/books.ts'
import { quoteKey } from './lib/market.ts'
import { customerFromRow, customerToRow, entryFromRow, entryToRow, shopFromRow, shopToRow, watchFromRow, type Customer, type EntryInput, type Shop, type Watch } from './lib/rows.ts'
import { supabase } from './lib/supabase.ts'

export type Draft =
  | { mode: 'create'; preset?: Partial<Entry> & { attachedName?: string; prices?: CatalogProduct['prices'] } }
  | { mode: 'edit'; entry: Entry }
  | { mode: 'sell'; buy: Entry }

type ShopValue = {
  entries: Entry[]
  shops: Shop[]
  customers: Customer[]
  watch: Watch[]
  quotes: Record<string, Quote>
  loading: boolean
  error: string | null
  setError: (message: string | null) => void
  draft: Draft | null
  openDraft: (draft: Draft) => void
  closeDraft: () => void
  saveEntry: (input: EntryInput, id?: string) => Promise<void>
  saveOrder: (items: { input: EntryInput; id?: string }[], removeIds?: string[]) => Promise<void>
  deleteEntry: (id: string) => Promise<void>
  saveShop: (input: Omit<Shop, 'id' | 'createdAt' | 'updatedAt'>, id?: string) => Promise<void>
  deleteShop: (id: string) => Promise<void>
  saveCustomer: (input: Omit<Customer, 'id' | 'createdAt' | 'updatedAt'>, id?: string) => Promise<void>
  deleteCustomer: (id: string) => Promise<void>
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
  const [shops, setShops] = useState<Shop[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
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
    const [entryRes, watchRes, shopRes, customerRes] = await Promise.all([
      supabase.from('entries').select('*').order('occurred_on', { ascending: false }).limit(2000),
      supabase.from('watchlist').select('*').order('created_at', { ascending: false }),
      supabase.from('shops').select('*').order('name'),
      supabase.from('customers').select('*').order('name'),
    ])
    if (entryRes.error) throw new Error(entryRes.error.message)
    if (watchRes.error) throw new Error(watchRes.error.message)
    if (shopRes.error) throw new Error(shopRes.error.message)
    if (customerRes.error) throw new Error(customerRes.error.message)
    const nextEntries = ((entryRes.data || []) as Parameters<typeof entryFromRow>[0][]).map(entryFromRow).sort(byDate)
    const nextWatch = ((watchRes.data || []) as Parameters<typeof watchFromRow>[0][]).map(watchFromRow)
    const nextShops = ((shopRes.data || []) as Parameters<typeof shopFromRow>[0][]).map(shopFromRow)
    const nextCustomers = ((customerRes.data || []) as Parameters<typeof customerFromRow>[0][]).map(customerFromRow)
    setEntries(nextEntries)
    setWatch(nextWatch)
    setShops(nextShops)
    setCustomers(nextCustomers)
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

  const saveOrder = useCallback(async (items: { input: EntryInput; id?: string }[], removeIds: string[] = []) => {
    if (!supabase) throw new Error('Supabase is not configured.')
    const saved: Entry[] = []
    const creating = items.filter((item) => !item.id)
    const updating = items.filter((item) => item.id)
    if (creating.length) {
      const { data, error: insertError } = await supabase
        .from('entries')
        .insert(creating.map((item) => entryToRow(item.input, userId)))
        .select('*')
      if (insertError) throw new Error(insertError.message)
      saved.push(...(data || []).map((row) => entryFromRow(row as Parameters<typeof entryFromRow>[0])))
    }
    for (const item of updating) {
      const { data, error: updateError } = await supabase
        .from('entries')
        .update(entryToRow(item.input, userId))
        .eq('id', item.id)
        .select('*')
        .single()
      if (updateError) throw new Error(updateError.message)
      saved.push(entryFromRow(data as Parameters<typeof entryFromRow>[0]))
    }
    for (const id of removeIds) {
      const { error: deleteError } = await supabase.from('entries').delete().eq('id', id)
      if (deleteError) {
        if (/foreign key|restrict/i.test(deleteError.message)) {
          throw new Error('Delete the sales of this purchase first.')
        }
        throw new Error(deleteError.message)
      }
    }
    const gone = new Set([...saved.map((entry) => entry.id), ...removeIds])
    setEntries((current) => [...saved, ...current.filter((entry) => !gone.has(entry.id))].sort(byDate))
    const priced = saved.filter((entry) => entry.productId && entry.subtype)
    if (priced.length) {
      loadQuotes(priced.map((entry) => ({ productId: entry.productId as number, subtype: entry.subtype as string }))).catch(() => {})
    }
  }, [loadQuotes, userId])

  const saveEntry = useCallback(async (input: EntryInput, id?: string) => {
    await saveOrder([{ input, id }])
  }, [saveOrder])

  const saveShop = useCallback(async (input: Omit<Shop, 'id' | 'createdAt' | 'updatedAt'>, id?: string) => {
    if (!supabase) throw new Error('Supabase is not configured.')
    const row = shopToRow(input, userId)
    const query = id
      ? supabase.from('shops').update(row).eq('id', id).select('*').single()
      : supabase.from('shops').insert(row).select('*').single()
    const { data, error: saveError } = await query
    if (saveError) throw new Error(saveError.message)
    const next = shopFromRow(data as Parameters<typeof shopFromRow>[0])
    setShops((current) => {
      const without = current.filter((shop) => shop.id !== next.id)
      return [...without, next].sort((a, b) => a.name.localeCompare(b.name))
    })
  }, [userId])

  const deleteShop = useCallback(async (id: string) => {
    if (!supabase) throw new Error('Supabase is not configured.')
    const { error: deleteError } = await supabase.from('shops').delete().eq('id', id)
    if (deleteError) throw new Error(deleteError.message)
    setShops((current) => current.filter((shop) => shop.id !== id))
    setEntries((current) => current.map((entry) => entry.shopId === id ? { ...entry, shopId: null } : entry))
  }, [])

  const saveCustomer = useCallback(async (input: Omit<Customer, 'id' | 'createdAt' | 'updatedAt'>, id?: string) => {
    if (!supabase) throw new Error('Supabase is not configured.')
    const row = customerToRow(input, userId)
    const query = id
      ? supabase.from('customers').update(row).eq('id', id).select('*').single()
      : supabase.from('customers').insert(row).select('*').single()
    const { data, error: saveError } = await query
    if (saveError) throw new Error(saveError.message)
    const next = customerFromRow(data as Parameters<typeof customerFromRow>[0])
    setCustomers((current) => {
      const without = current.filter((customer) => customer.id !== next.id)
      return [...without, next].sort((a, b) => a.name.localeCompare(b.name))
    })
  }, [userId])

  const deleteCustomer = useCallback(async (id: string) => {
    if (!supabase) throw new Error('Supabase is not configured.')
    const { error: deleteError } = await supabase.from('customers').delete().eq('id', id)
    if (deleteError) throw new Error(deleteError.message)
    setCustomers((current) => current.filter((customer) => customer.id !== id))
    setEntries((current) => current.map((entry) => entry.customerId === id ? { ...entry, customerId: null } : entry))
  }, [])

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
    shops,
    customers,
    watch,
    quotes,
    loading,
    error,
    setError,
    draft,
    openDraft: setDraft,
    closeDraft: () => setDraft(null),
    saveEntry,
    saveOrder,
    deleteEntry,
    saveShop,
    deleteShop,
    saveCustomer,
    deleteCustomer,
    watchProduct,
    unwatch,
    refreshMarket,
    quoteFor,
  }), [entries, shops, customers, watch, quotes, loading, error, draft, saveEntry, saveOrder, deleteEntry, saveShop, deleteShop, saveCustomer, deleteCustomer, watchProduct, unwatch, refreshMarket, quoteFor])

  return <ShopContext.Provider value={value}>{children}</ShopContext.Provider>
}

export function useShop() {
  const value = useContext(ShopContext)
  if (!value) throw new Error('Shop data is only available once you are signed in.')
  return value
}
