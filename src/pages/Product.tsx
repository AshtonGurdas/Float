import { useEffect, useState } from 'react'
import { PriceChart } from '../components/Chart.tsx'
import { Thumb } from '../components/Thumb.tsx'
import { productDetail, type CatalogProduct } from '../lib/api.ts'
import { money, signedMoney, signedPct, todayISO, tone } from '../lib/format.ts'
import { caseMarket, imageLarge } from '../lib/market.ts'
import { useShop } from '../store.tsx'

function shortDay(iso: string | null) {
  if (!iso || iso.length < 10) return null
  const [year, month, day] = iso.slice(0, 10).split('-').map(Number)
  if (!year || !month || !day) return null
  return new Date(year, month - 1, day).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

const RANGES = [
  { id: '7d', days: 7, label: '1W' },
  { id: '1m', days: 31, label: '1M' },
  { id: '3m', days: 93, label: '3M' },
  { id: '1y', days: 366, label: '1Y' },
  { id: 'all', days: null, label: 'ALL' },
]

export function ProductPage({ productId, subtype }: { productId: number; subtype: string | null }) {
  const { watch, watchProduct, unwatch, openDraft, entries, setError } = useShop()
  const [product, setProduct] = useState<CatalogProduct | null>(null)
  const [history, setHistory] = useState<{ date: string; market: number }[]>([])
  const [activeSubtype, setActiveSubtype] = useState(subtype || '')
  const [sale, setSale] = useState<{
    productId: number
    subtype: string
    lastSold: number | null
    lastSoldCondition: string | null
    lastSoldAt: string | null
    saleKnown: boolean
    change: number | null
  } | null>(null)
  const [loading, setLoading] = useState(true)
  const [range, setRange] = useState('1m')
  const [boxes, setBoxes] = useState(6)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let live = true
    setLoading(true)
    productDetail(productId, subtype)
      .then((data) => {
        if (!live) return
        setProduct(data.product)
        setHistory(data.history)
        setSale({
          productId,
          subtype: data.subtype,
          lastSold: data.lastSold,
          lastSoldCondition: data.lastSoldCondition,
          lastSoldAt: data.lastSoldAt,
          saleKnown: data.saleKnown,
          change: data.change,
        })
        setActiveSubtype(data.subtype)
      })
      .catch((err: unknown) => {
        if (live) setError(err instanceof Error ? err.message : 'That product did not load.')
      })
      .finally(() => {
        if (live) setLoading(false)
      })
    return () => {
      live = false
    }
  }, [productId, subtype, setError])

  async function changeSubtype(next: string) {
    setActiveSubtype(next)
    location.hash = `#/product/${productId}?sub=${encodeURIComponent(next)}`
  }

  if (loading && !product) return <p className="quiet">Loading the price…</p>
  if (!product) return <p className="quiet">That product is not available.</p>

  const selected = product.prices.find((price) => price.subtype === activeSubtype) || product.prices[0]
  const market = selected?.market ?? null
  const shownSale = sale?.productId === productId && sale.subtype === (selected?.subtype || '') ? sale : null
  const lastSold = shownSale?.lastSold ?? null
  const change = shownSale?.change ?? null
  const pct = change != null && market ? (change / market) * 100 : null
  const soldDay = shortDay(shownSale?.lastSoldAt ?? null)
  const cutoff = RANGES.find((item) => item.id === range)?.days
  const points = cutoff
    ? history.filter((point) => point.date >= new Date(Date.now() - cutoff * 86400000).toISOString().slice(0, 10))
    : history
  const shown = points.length >= 2 ? points : history
  const isBox = product.sealed && /booster box/i.test(product.name) && !/case/i.test(product.name)
  const casePrice = isBox ? caseMarket(product.name, market, boxes) : null
  const watching = watch.find((item) => item.productId === product.productId && item.subtype === (selected?.subtype || activeSubtype))
  const held = entries.filter((entry) => entry.productId === product.productId && entry.direction === 'out')

  async function toggle() {
    if (!product || !selected) return
    setBusy(true)
    try {
      if (watching) await unwatch(watching.id)
      else await watchProduct(product, selected.subtype)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update the watchlist.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section>
      <button type="button" className="text-btn back" onClick={() => { location.hash = '#/market' }}>Back to market</button>
      <div className="product-id">
        <Thumb src={imageLarge(product.imageUrl) || product.imageUrl} name={product.name} large />
        <div>
          <p className="kicker">{product.sealed ? 'Sealed' : 'Card'}</p>
          <h1>{product.name}</h1>
          <p className="quiet">{[product.setName, product.number, product.rarity].filter(Boolean).join(' · ')}</p>
        </div>
      </div>
      {product.prices.length > 1 ? (
        <div className="chips" role="group" aria-label="Printing">
          {product.prices.map((price) => (
            <button key={price.subtype} type="button" className="chip" aria-pressed={price.subtype === selected?.subtype} onClick={() => changeSubtype(price.subtype)}>
              {price.subtype}
            </button>
          ))}
        </div>
      ) : null}
      <p className="hero-label">Market price</p>
      <p className="hero-num num">{market == null ? '—' : money(market)}</p>
      <p className="quiet">
        {!shownSale
          ? 'Checking the last sale…'
          : !shownSale.saleKnown
            ? 'Last sale unavailable right now.'
            : lastSold == null
              ? 'No recent English sale for this printing.'
              : `Last sold ${money(lastSold)}${shownSale.lastSoldCondition ? ` · ${shownSale.lastSoldCondition}` : ''}${soldDay ? ` · ${soldDay}` : ''}`}
      </p>
      {change != null ? (
        <p className={`quiet ${tone(change)}`}>
          {signedMoney(change)} ({signedPct(pct)}) versus market
        </p>
      ) : null}
      <div className="seg slim" role="group" aria-label="Chart range">
        {RANGES.map((item) => (
          <button key={item.id} type="button" aria-pressed={range === item.id} onClick={() => setRange(item.id)}>{item.label}</button>
        ))}
      </div>
      <PriceChart points={shown} />
      <p className="quiet">The chart is the daily market price.</p>
      <div className="split three">
        <div><span>Low</span><strong className="num">{selected?.low == null ? '—' : money(selected.low)}</strong></div>
        <div><span>Market</span><strong className="num">{market == null ? '—' : money(market)}</strong></div>
        <div><span>Mid</span><strong className="num">{selected?.mid == null ? '—' : money(selected.mid)}</strong></div>
      </div>
      {isBox ? (
        <label className="field case-math">
          Boxes in a case
          <input inputMode="numeric" value={boxes} onChange={(event) => setBoxes(Math.max(1, Number(event.target.value) || 1))} />
          <span className="quiet">
            {casePrice == null ? 'No market price for a case estimate yet.' : `A case of ${boxes} is ${money(casePrice)} at this box’s market price.`}
          </span>
        </label>
      ) : null}
      {held.length > 0 ? (
        <p className="quiet">In your books: {held.reduce((sum, entry) => sum + entry.quantity, 0)} logged as purchases.</p>
      ) : null}
      <div className="action-row">
        <button type="button" className="btn" onClick={toggle} disabled={busy || !selected}>
          {watching ? 'Remove watch' : 'Add to watchlist'}
        </button>
        <button
          type="button"
          className="btn ghost"
          onClick={() => openDraft({
            mode: 'create',
            preset: {
              direction: 'out',
              itemKind: product.sealed
                ? (/case/i.test(product.name) ? 'case' : /booster box/i.test(product.name) ? 'box' : 'sealed')
                : 'card',
              title: product.number ? `${product.name} ${product.number}` : product.name,
              detail: product.setName || '',
              quantity: 1,
              unitAmount: market != null && market > 0 ? market : undefined,
              fees: 0,
              occurredOn: todayISO(),
              notes: '',
              productId: product.productId,
              subtype: selected?.subtype || null,
              boxesPerCase: 6,
              lotId: null,
              attachedName: product.name,
              prices: product.prices,
            },
          })}
        >
          Log a buy
        </button>
        {product.url ? (
          <a className="btn ghost" href={product.url} target="_blank" rel="noreferrer">View on TCGplayer</a>
        ) : null}
      </div>
      <p className="quiet">Market price is TCGplayer’s daily number for this printing, not a grade. Last sold is the newest English sale they list for that same printing.</p>
    </section>
  )
}
