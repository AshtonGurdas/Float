import { useEffect, useState } from 'react'
import { Thumb } from '../components/Thumb.tsx'
import { picturesFor, type Quote } from '../lib/api.ts'
import { positions, roundMoney, type Lot } from '../lib/books.ts'
import { kindLabel, money, signedMoney, tone } from '../lib/format.ts'
import { quoteKey } from '../lib/market.ts'
import { useShop } from '../store.tsx'

function heldMarket(lot: Lot, quote: Quote | undefined) {
  if (!quote || quote.market == null) return null
  if (lot.buy.itemKind === 'case' && lot.buy.boxesPerCase && !/case/i.test(quote.name)) {
    return roundMoney(quote.market * lot.buy.boxesPerCase)
  }
  return quote.market
}

export function InventoryPage() {
  const { entries, quotes, openDraft, setError } = useShop()
  const [photos, setPhotos] = useState<Record<string, string>>({})
  const lots = positions(entries)
  const photoKey = entries.map((entry) => `${entry.id}:${entry.title}:${entry.detail}`).join('|')
  useEffect(() => {
    let live = true
    const items = positions(entries).map((lot) => ({ id: lot.buy.id, title: lot.buy.title, detail: lot.buy.detail }))
    if (!items.length) return
    picturesFor(items)
      .then((data) => {
        if (!live) return
        const next: Record<string, string> = {}
        for (const item of data.items) next[item.id] = item.imageUrl
        setPhotos(next)
      })
      .catch((err: unknown) => {
        if (live) setError(err instanceof Error ? err.message : 'Card photos did not load.')
      })
    return () => {
      live = false
    }
  }, [photoKey, entries, setError])
  const open = lots.filter((lot) => lot.remaining > 0)
  const closed = lots.filter((lot) => lot.remaining <= 0)
  const tied = open.reduce((sum, lot) => sum + lot.costLeft, 0)
  let worth = 0
  let basis = 0
  let priced = 0
  for (const lot of open) {
    const each = heldMarket(lot, quotes[quoteKey(lot.buy.productId || 0, lot.buy.subtype)])
    if (each == null || !lot.buy.productId) continue
    worth += each * lot.remaining
    basis += lot.costLeft
    priced += 1
  }
  const unrealized = worth - basis

  return (
    <section>
      <header className="page-head">
        <div>
          <p className="kicker">On hand</p>
          <h1>Stock</h1>
        </div>
        <button type="button" className="icon-btn" aria-label="Add an entry" onClick={() => openDraft({ mode: 'create' })}>+</button>
      </header>
      <div className="hero">
        <div className="split three">
          <div>
            <span>Tied up</span>
            <strong className="num">{money(tied)}</strong>
          </div>
          <div>
            <span>Market</span>
            <strong className="num">{priced ? money(worth) : '—'}</strong>
          </div>
          <div>
            <span>Open</span>
            <strong className={`num ${priced ? tone(unrealized) : 'flat'}`}>{priced ? signedMoney(unrealized) : '—'}</strong>
          </div>
        </div>
        <p className="quiet">
          {priced
            ? `Market covers ${priced} of ${open.length} open ${open.length === 1 ? 'lot' : 'lots'} that have a TCGplayer listing.`
            : 'Attach a TCGplayer listing on a purchase to see what that stock is worth today.'}
        </p>
      </div>
      {open.length === 0 ? (
        <div className="empty">
          <p>Nothing left on hand.</p>
          <p>Log a card, a booster box, or a case. When you sell it, do that from here so the profit stays tied to the cost.</p>
        </div>
      ) : (
        <div className="ledger">
          {open.map((lot) => (
            <LotRow
              key={lot.buy.id}
              lot={lot}
              quote={quotes[quoteKey(lot.buy.productId || 0, lot.buy.subtype)]}
              photo={photos[lot.buy.id]}
            />
          ))}
        </div>
      )}
      {closed.length > 0 ? (
        <details className="closed">
          <summary>Sold through ({closed.length})</summary>
          <div className="ledger">
            {closed.map((lot) => (
              <LotRow
                key={lot.buy.id}
                lot={lot}
                quote={quotes[quoteKey(lot.buy.productId || 0, lot.buy.subtype)]}
                photo={photos[lot.buy.id]}
              />
            ))}
          </div>
        </details>
      ) : null}
    </section>
  )
}

function LotRow({ lot, quote, photo }: { lot: Lot; quote: Quote | undefined; photo?: string }) {
  const { openDraft } = useShop()
  const each = heldMarket(lot, quote)
  const openValue = each == null ? null : each * lot.remaining - lot.costLeft
  const image = quote?.imageUrl || photo || null
  return (
    <article className="lot">
      <Thumb src={image} name={lot.buy.title} />
      <div>
        <p className="row-title">{lot.buy.title}</p>
        <p className="row-sub">
          {[kindLabel(lot.buy), lot.buy.detail, `${lot.remaining} left`, `cost ${money(lot.costLeft)}`].filter(Boolean).join(' · ')}
        </p>
        {each == null ? (
          <p className="quiet">No market price on this line.</p>
        ) : (
          <p className={`quiet ${tone(openValue || 0)}`}>
            Market {money(each)} each · open {signedMoney(openValue || 0)}
          </p>
        )}
      </div>
      <div className="lot-actions">
        {lot.remaining > 0 ? (
          <button type="button" className="btn" onClick={() => openDraft({ mode: 'sell', buy: lot.buy })}>Sell</button>
        ) : null}
        <button type="button" className="btn ghost" onClick={() => openDraft({ mode: 'edit', entry: lot.buy })}>Edit</button>
      </div>
    </article>
  )
}
