import { useEffect, useState } from 'react'
import { Thumb } from '../components/Thumb.tsx'
import { Spark } from '../components/Chart.tsx'
import { latestSealed, searchProducts, type CatalogProduct, type SetHit } from '../lib/api.ts'
import { money, signedMoney, signedPct, tone } from '../lib/format.ts'
import { pickSubtype, quoteKey } from '../lib/market.ts'
import { GAMES } from '../../shared/games.js'
import { useShop } from '../store.tsx'

type Filter = 'all' | 'card' | 'sealed'

export function MarketPage() {
  const { watch, quotes, watchProduct, unwatch, refreshMarket, setError } = useShop()
  const [game, setGame] = useState(() => localStorage.getItem('float.game') || 'pokemon')
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [results, setResults] = useState<CatalogProduct[]>([])
  const [sets, setSets] = useState<SetHit[]>([])
  const [note, setNote] = useState<string | null>(null)
  const [searching, setSearching] = useState(false)
  const [latest, setLatest] = useState<CatalogProduct[]>([])
  const [latestLoading, setLatestLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => {
    localStorage.setItem('float.game', game)
  }, [game])

  useEffect(() => {
    let live = true
    setLatestLoading(true)
    latestSealed(game)
      .then((data) => {
        if (live) setLatest(data.results)
      })
      .catch((err: unknown) => {
        if (live) setError(err instanceof Error ? err.message : 'Latest boxes did not load.')
      })
      .finally(() => {
        if (live) setLatestLoading(false)
      })
    return () => {
      live = false
    }
  }, [game, setError])

  useEffect(() => {
    const q = query.trim()
    if (q.length < 2) {
      setResults([])
      setSets([])
      setNote(null)
      return
    }
    let live = true
    const timer = window.setTimeout(() => {
      setSearching(true)
      searchProducts(game, q, filter)
        .then((data) => {
          if (!live) return
          setResults(data.results)
          setSets(data.sets)
          setNote(data.note)
        })
        .catch((err: unknown) => {
          if (live) setError(err instanceof Error ? err.message : 'Search failed.')
        })
        .finally(() => {
          if (live) setSearching(false)
        })
    }, 300)
    return () => {
      live = false
      window.clearTimeout(timer)
    }
  }, [game, query, filter, setError])

  async function toggleWatch(product: CatalogProduct) {
    const subtype = pickSubtype(product.prices)
    const existing = watch.find((item) => item.productId === product.productId && item.subtype === subtype)
    try {
      if (existing) await unwatch(existing.id)
      else await watchProduct(product, subtype)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update the watchlist.')
    }
  }

  async function onRefresh() {
    setRefreshing(true)
    try {
      await refreshMarket()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Prices did not refresh.')
    } finally {
      setRefreshing(false)
    }
  }

  return (
    <section>
      <header className="page-head">
        <div>
          <p className="kicker">Watchlist</p>
          <h1>Market</h1>
        </div>
        <button type="button" className="btn ghost" onClick={onRefresh} disabled={refreshing || watch.length === 0}>
          {refreshing ? 'Updating…' : 'Update'}
        </button>
      </header>
      <p className="quiet">Daily TCGplayer market price. Not a live tick — it moves when the day’s prices land.</p>
      <label className="field search-field">
        <span className="sr-only">Search cards and sealed product</span>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search a card or a booster box"
          autoComplete="off"
        />
      </label>
      <div className="chips" role="group" aria-label="Game">
        {GAMES.map((item) => (
          <button key={item.key} type="button" className="chip" aria-pressed={game === item.key} onClick={() => setGame(item.key)}>
            {item.name}
          </button>
        ))}
      </div>
      <div className="seg slim" role="group" aria-label="Cards or sealed">
        <button type="button" aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>All</button>
        <button type="button" aria-pressed={filter === 'card'} onClick={() => setFilter('card')}>Cards</button>
        <button type="button" aria-pressed={filter === 'sealed'} onClick={() => setFilter('sealed')}>Sealed</button>
      </div>

      {query.trim().length < 2 ? (
        <div className="stack">
          <h2>Watching</h2>
          {watch.length === 0 ? (
            <div className="empty">
              <p>No cards or boxes on the list yet.</p>
              <p>Search a name, open it, and add it. The day-to-day move starts from the next price update.</p>
            </div>
          ) : (
            <div className="ledger">
              {watch.map((item) => {
                const quote = quotes[quoteKey(item.productId, item.subtype)]
                const change = quote?.change ?? null
                const pct = quote && quote.previous ? (change == null ? null : (change / quote.previous) * 100) : null
                return (
                  <div key={item.id} className="quote">
                    <button
                      type="button"
                      className="quote-main"
                      onClick={() => {
                        location.hash = `#/product/${item.productId}?sub=${encodeURIComponent(item.subtype)}`
                      }}
                    >
                      <Thumb src={quote?.imageUrl || item.imageUrl} name={item.name} />
                      <span>
                        <span className="row-title">{item.name}</span>
                        <span className="row-sub">{[item.setName, item.subtype].filter(Boolean).join(' · ')}</span>
                      </span>
                      <Spark values={(quote?.history || []).map((point) => point.market)} tone={tone(change || 0)} />
                      <span className="quote-price">
                        <strong className="num">{quote?.market == null ? '—' : money(quote.market)}</strong>
                        <span className={`num ${tone(change || 0)}`}>
                          {change == null ? 'No move yet' : `${signedMoney(change)} ${signedPct(pct) || ''}`}
                        </span>
                      </span>
                    </button>
                  </div>
                )
              })}
            </div>
          )}
          <h2>Latest sealed</h2>
          {latestLoading ? <p className="quiet">Pulling the newest sets from TCGplayer…</p> : null}
          <ProductList products={latest} watch={watch} onToggle={toggleWatch} />
        </div>
      ) : (
        <div className="stack">
          <h2>Results</h2>
          {searching ? <p className="quiet">Searching TCGplayer…</p> : null}
          {note ? <p className="quiet">{note}</p> : null}
          <ProductList products={results} watch={watch} onToggle={toggleWatch} />
          {sets.length > 0 ? (
            <>
              <h2>Open a set</h2>
              <div className="chips">
                {sets.map((set) => (
                  <button key={set.groupId} type="button" className="chip" onClick={() => setQuery(set.name)}>
                    {set.name}
                  </button>
                ))}
              </div>
            </>
          ) : null}
        </div>
      )}
    </section>
  )
}

function ProductList({
  products,
  watch,
  onToggle,
}: {
  products: CatalogProduct[]
  watch: { productId: number; subtype: string }[]
  onToggle: (product: CatalogProduct) => void
}) {
  if (!products.length) return null
  return (
    <div className="ledger">
      {products.map((product) => {
        const subtype = pickSubtype(product.prices)
        const price = product.prices.find((item) => item.subtype === subtype)
        const watching = watch.some((item) => item.productId === product.productId && item.subtype === subtype)
        return (
          <div key={`${product.productId}-${subtype}`} className="quote">
            <button
              type="button"
              className="quote-main"
              onClick={() => {
                location.hash = `#/product/${product.productId}?sub=${encodeURIComponent(subtype)}`
              }}
            >
              <Thumb src={product.imageUrl} name={product.name} />
              <span>
                <span className="row-title">{product.name}</span>
                <span className="row-sub">
                  {[product.setName, product.number, subtype, product.sealed ? 'Sealed' : null].filter(Boolean).join(' · ')}
                </span>
              </span>
              <span className="quote-price">
                <strong className="num">{price?.market == null ? '—' : money(price.market)}</strong>
              </span>
            </button>
            <button type="button" className="btn ghost" onClick={() => onToggle(product)}>
              {watching ? 'Watching' : 'Watch'}
            </button>
          </div>
        )
      })}
    </div>
  )
}
