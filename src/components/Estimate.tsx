import { useEffect, useMemo, useState } from 'react'
import type { Quote } from '../lib/api.ts'
import { stockMarkets } from '../lib/api.ts'
import { costGroupKey, openEstimate, positions, type Lot } from '../lib/books.ts'
import { rateLabel, useCadRate } from '../lib/cad.ts'
import { money, prettyDate, signedMoney, todayISO } from '../lib/format.ts'
import { lotMarket, quoteKey, toCad } from '../lib/market.ts'
import { useShop } from '../store.tsx'

type Found = { name: string; market: number | null }

function marketEach(lot: Lot, quotes: Record<string, Quote>) {
  if (!lot.buy.productId) return null
  const quote = quotes[quoteKey(lot.buy.productId, lot.buy.subtype)]
  if (!quote || quote.market == null) return null
  return lotMarket(lot.buy.itemKind, lot.buy.boxesPerCase, quote.name, quote.market)
}

function priceEach(lot: Lot, quotes: Record<string, Quote>, found: Record<string, Found>, usdCad: number | null) {
  if (usdCad == null) return null
  const linked = marketEach(lot, quotes)
  if (linked != null) return toCad(linked, usdCad)
  const match = found[lot.buy.id]
  if (!match || match.market == null) return null
  return toCad(lotMarket(lot.buy.itemKind, lot.buy.boxesPerCase, match.name, match.market), usdCad)
}

function whenFor(day: string | null, today: string) {
  if (!day) {
    return {
      key: 'undated',
      sort: '2',
      title: 'No date yet',
      detail: 'No arrival day is set, so there is no date for this money yet.',
    }
  }
  if (day <= today) {
    return {
      key: 'hand',
      sort: '0',
      title: 'Already in hand',
      detail: 'You already have it. The money comes when you sell it.',
    }
  }
  return {
    key: day,
    sort: `1-${day}`,
    title: `Around ${prettyDate(day)}, ${day.slice(0, 4)}`,
    detail: 'That is when it arrives, so the money comes after you sell it.',
  }
}

export function Estimate() {
  const { entries, quotes, setError } = useShop()
  const cad = useCadRate()
  const usdCad = cad.state === 'ready' ? cad.rate?.usdCad ?? null : null
  const today = todayISO()
  const open = useMemo(() => positions(entries).filter((lot) => lot.remaining > 0), [entries])
  const choices = useMemo(() => {
    const buckets = new Map<string, Lot[]>()
    for (const lot of open) {
      const key = costGroupKey(lot.buy.title)
      const list = buckets.get(key) || []
      list.push(lot)
      buckets.set(key, list)
    }
    return [...buckets.entries()]
      .map(([key, lots]) => {
        const titles = [...new Set(lots.map((lot) => lot.buy.title))].sort((a, b) => a.length - b.length || a.localeCompare(b))
        return { key, lots, label: titles[0] || 'Stock' }
      })
      .sort((a, b) => a.label.localeCompare(b.label))
  }, [open])
  const [pick, setPick] = useState<string | null>(null)
  const [found, setFound] = useState<Record<string, Found>>({})
  const [checking, setChecking] = useState(false)
  const needKey = open.map((lot) => `${lot.buy.id}:${lot.buy.title}:${lot.buy.detail}`).join('|')

  useEffect(() => {
    const items = open
      .filter((lot) => marketEach(lot, quotes) == null)
      .map((lot) => ({ id: lot.buy.id, title: lot.buy.title, detail: lot.buy.detail }))
    if (!items.length) {
      setChecking(false)
      return
    }
    let live = true
    setChecking(true)
    stockMarkets(items)
      .then((data) => {
        if (!live) return
        const next: Record<string, Found> = {}
        for (const item of data.items) next[item.id] = { name: item.name, market: item.market }
        setFound(next)
      })
      .catch((err: unknown) => {
        if (!live) return
        setError(err instanceof Error ? err.message : 'TCGplayer did not answer.')
      })
      .finally(() => {
        if (live) setChecking(false)
      })
    return () => {
      live = false
    }
  }, [needKey, open, quotes, setError])

  const picked = useMemo(() => {
    if (!pick) return []
    if (pick === 'all') return open
    return choices.find((choice) => choice.key === pick)?.lots || []
  }, [pick, open, choices])
  const estimate = useMemo(
    () => openEstimate(picked, (lot) => priceEach(lot, quotes, found, usdCad)),
    [picked, quotes, found, usdCad],
  )
  const windows = useMemo(() => {
    const buckets = new Map<string, { key: string; sort: string; title: string; detail: string; lots: Lot[] }>()
    for (const lot of picked) {
      const when = whenFor(lot.buy.arrivesOn, today)
      const bucket = buckets.get(when.key) || { ...when, lots: [] as Lot[] }
      bucket.lots.push(lot)
      buckets.set(when.key, bucket)
    }
    return [...buckets.values()]
      .sort((a, b) => a.sort.localeCompare(b.sort))
      .map((bucket) => ({
        ...bucket,
        estimate: openEstimate(bucket.lots, (lot) => priceEach(lot, quotes, found, usdCad)),
      }))
  }, [picked, today, quotes, found, usdCad])

  if (!open.length) {
    return (
      <section aria-label="Profit calculator">
        <header className="page-head">
          <div>
            <p className="kicker">Guess</p>
            <h1>Profit calculator</h1>
          </div>
        </header>
        <p className="quiet">Nothing is left on hand. A guess shows up here when a purchase still has some quantity.</p>
      </section>
    )
  }

  const waiting = checking || cad.state === 'loading'
  const headline = estimate.priced ? signedMoney(estimate.profit) : waiting ? '…' : '—'
  const several = windows.length > 1

  return (
    <section aria-label="Profit calculator">
      <header className="page-head">
        <div>
          <p className="kicker">Guess</p>
          <h1>Profit calculator</h1>
        </div>
      </header>
      <p className="quiet">Pick a stock. The price is the TCGplayer market, and the date is when that stock arrives.</p>
      <div className="pick-list" role="group" aria-label="Which stock">
        <button type="button" className="chip" aria-pressed={pick === 'all'} onClick={() => setPick('all')}>All of it</button>
        {choices.map((choice) => (
          <button key={choice.key} type="button" className="chip" aria-pressed={pick === choice.key} onClick={() => setPick(choice.key)}>
            {choice.label}
          </button>
        ))}
      </div>
      {pick && picked.length ? (
        <div aria-live="polite">
          <div className="hero">
            <p className="hero-label">You'd make</p>
            <p className={`hero-num num ${estimate.priced && estimate.profit < 0 ? 'down' : 'gold'}`}>{headline}</p>
            {estimate.priced ? (
              <>
                <div className="split">
                  <div>
                    <span>Would come in</span>
                    <strong className="num">{money(estimate.proceeds)}</strong>
                  </div>
                  <div>
                    <span>Still in the stock</span>
                    <strong className="num">{money(estimate.cost)}</strong>
                  </div>
                </div>
                <p className="quiet">Your stock cost is in Canadian dollars. TCGplayer’s US price is converted at the Bank of Canada rate, {cad.rate ? rateLabel(cad.rate) : 'today'}. Books keeps its own Profit for sales you already logged.</p>
              </>
            ) : (
              <p className="quiet">
                {cad.state === 'error'
                  ? 'The Canadian exchange rate did not load, so this guess stays hidden.'
                  : waiting
                    ? 'Checking TCGplayer…'
                    : 'TCGplayer does not have a market price for this yet.'}
              </p>
            )}
            {estimate.priced && estimate.missing > 0 ? (
              <p className="quiet">{estimate.missing} {estimate.missing === 1 ? 'does' : 'do'} not have a TCGplayer price, so {estimate.missing === 1 ? 'it is' : 'they are'} left out.</p>
            ) : null}
          </div>
          {windows.map((window) => (
            <div key={window.key} className="when-block">
              <p className="day-label">{window.title}</p>
              <p className="quiet">{window.detail}</p>
              {several && window.estimate.priced ? (
                <p className="row-title">{signedMoney(window.estimate.profit)} from this date · about {money(window.estimate.proceeds)} would come in</p>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
    </section>
  )
}
