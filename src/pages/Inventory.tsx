import { useEffect, useState } from 'react'
import { Thumb } from '../components/Thumb.tsx'
import { picturesFor, type Quote } from '../lib/api.ts'
import { averageCosts, costGroupKey, lineCash, positions, roundMoney, type AverageCost, type Entry, type Lot } from '../lib/books.ts'
import { kindLabel, money, monthLabel, prettyDate, signedMoney, todayISO, tone } from '../lib/format.ts'
import { quoteKey } from '../lib/market.ts'
import { CARRIERS, carrierLabel, guessCarrier, trackingUrl } from '../../shared/tracking.js'
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
  const [trackingLot, setTrackingLot] = useState<Lot | null>(null)
  const [view, setView] = useState<'list' | 'sold' | 'calendar'>('list')
  const today = todayISO()
  const [cursor, setCursor] = useState(() => {
    const [year, month] = todayISO().split('-').map(Number)
    return { year, month }
  })
  const [selected, setSelected] = useState(todayISO)
  const lots = positions(entries)
  const averages = averageCosts(entries)
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
      <div className="seg" role="group" aria-label="Stock view">
        <button type="button" aria-pressed={view === 'list'} onClick={() => setView('list')}>On hand</button>
        <button type="button" aria-pressed={view === 'sold'} onClick={() => setView('sold')}>Sold{closed.length ? ` ${closed.length}` : ''}</button>
        <button type="button" aria-pressed={view === 'calendar'} onClick={() => setView('calendar')}>Calendar</button>
      </div>
      {view === 'calendar' ? (
        <ArrivalCalendar
          entries={entries}
          photos={photos}
          quotes={quotes}
          cursor={cursor}
          selected={selected}
          today={today}
          onCursor={setCursor}
          onSelect={setSelected}
        />
      ) : null}
      {view === 'list' && open.length === 0 ? (
        <div className="empty">
          <p>Nothing left on hand.</p>
          <p>Log a card, a booster box, or a case. When you sell it, do that from here so the profit stays tied to the cost.</p>
        </div>
      ) : null}
      {view === 'list' && open.length > 0 ? (
        <div className="ledger">
          {open.map((lot) => (
            <LotRow
              key={lot.buy.id}
              lot={lot}
              quote={quotes[quoteKey(lot.buy.productId || 0, lot.buy.subtype)]}
              photo={photos[lot.buy.id]}
              average={averages.get(costGroupKey(lot.buy.title))}
              onTrack={() => setTrackingLot(lot)}
            />
          ))}
        </div>
      ) : null}
      {view === 'sold' && closed.length === 0 ? (
        <div className="empty">
          <p>Nothing sold yet.</p>
          <p>Sell from a lot on hand. Once it is gone, it stays in this section.</p>
        </div>
      ) : null}
      {view === 'sold' && closed.length > 0 ? (
        <div className="ledger">
          {closed.map((lot) => (
            <LotRow
              key={lot.buy.id}
              lot={lot}
              quote={quotes[quoteKey(lot.buy.productId || 0, lot.buy.subtype)]}
              photo={photos[lot.buy.id]}
              onTrack={() => setTrackingLot(lot)}
            />
          ))}
        </div>
      ) : null}
      {trackingLot ? <TrackingSheet lot={trackingLot} onClose={() => setTrackingLot(null)} /> : null}
    </section>
  )
}

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']

function pad(value: number) {
  return String(value).padStart(2, '0')
}

function isoDay(year: number, month: number, day: number) {
  return `${year}-${pad(month)}-${pad(day)}`
}

function ArrivalCalendar({
  entries,
  photos,
  quotes,
  cursor,
  selected,
  today,
  onCursor,
  onSelect,
}: {
  entries: Entry[]
  photos: Record<string, string>
  quotes: Record<string, Quote>
  cursor: { year: number; month: number }
  selected: string
  today: string
  onCursor: (next: { year: number; month: number }) => void
  onSelect: (iso: string) => void
}) {
  const { openDraft } = useShop()
  const byDay = new Map<string, Entry[]>()
  for (const entry of entries) {
    if (entry.direction !== 'out' || entry.itemKind === 'fee' || !entry.arrivesOn) continue
    const list = byDay.get(entry.arrivesOn) || []
    list.push(entry)
    byDay.set(entry.arrivesOn, list)
  }
  const first = new Date(cursor.year, cursor.month - 1, 1)
  const days = new Date(cursor.year, cursor.month, 0).getDate()
  const cells: Array<number | null> = []
  for (let index = 0; index < first.getDay(); index += 1) cells.push(null)
  for (let day = 1; day <= days; day += 1) cells.push(day)
  while (cells.length % 7) cells.push(null)
  const monthKey = `${cursor.year}-${pad(cursor.month)}`
  const monthCount = [...byDay.keys()].filter((iso) => iso.startsWith(monthKey)).reduce((sum, iso) => sum + (byDay.get(iso)?.length || 0), 0)
  const items = (byDay.get(selected) || []).slice().sort((a, b) => a.title.localeCompare(b.title))

  function shift(by: number) {
    const date = new Date(cursor.year, cursor.month - 1 + by, 1)
    const next = { year: date.getFullYear(), month: date.getMonth() + 1 }
    onCursor(next)
    const [year, month] = selected.split('-').map(Number)
    if (year !== next.year || month !== next.month) onSelect(isoDay(next.year, next.month, 1))
  }

  return (
    <div>
      <div className="monthbar">
        <button type="button" className="icon-btn" aria-label="Previous month" onClick={() => shift(-1)}>‹</button>
        <strong>{monthLabel(cursor.year, cursor.month)}</strong>
        <button type="button" className="icon-btn" aria-label="Next month" onClick={() => shift(1)}>›</button>
      </div>
      <p className="quiet">{monthCount ? `${monthCount} this month` : 'No arrival dates this month.'}</p>
      <div className="cal" role="grid" aria-label="Arrival calendar">
        {WEEKDAYS.map((name) => <div key={name} className="cal-dow" role="columnheader">{name}</div>)}
        {cells.map((day, index) => {
          if (!day) return <button key={`empty-${index}`} type="button" className="cal-day" disabled tabIndex={-1} aria-hidden="true" />
          const iso = isoDay(cursor.year, cursor.month, day)
          const count = byDay.get(iso)?.length || 0
          return (
            <button
              key={iso}
              type="button"
              className={iso === today ? 'cal-day is-today' : 'cal-day'}
              aria-pressed={iso === selected}
              aria-label={count ? `${prettyDate(iso)}, ${count} ${count === 1 ? 'product' : 'products'}` : prettyDate(iso)}
              onClick={() => onSelect(iso)}
            >
              {day}
              <span className="cal-mark">{count || ''}</span>
            </button>
          )
        })}
      </div>
      <h2 className="release-day">{prettyDate(selected)}</h2>
      {items.length === 0 ? (
        <p className="quiet">Nothing arriving this day. Set Arrives when you add or edit a purchase.</p>
      ) : (
        <div className="ledger">
          {items.map((entry) => {
            const quote = quotes[quoteKey(entry.productId || 0, entry.subtype)]
            return (
              <article key={entry.id} className="lot">
                <Thumb src={quote?.imageUrl || photos[entry.id] || null} name={entry.title} />
                <button type="button" className="lot-open" onClick={() => openDraft({ mode: 'edit', entry })}>
                  <p className="row-title">{entry.title}</p>
                  <p className="row-sub">{[entry.detail, `${entry.quantity} ${entry.quantity === 1 ? 'piece' : 'pieces'}`].filter(Boolean).join(' · ')}</p>
                </button>
              </article>
            )
          })}
        </div>
      )}
    </div>
  )
}

function countText(value: number) {
  return String(Math.round(value * 1000) / 1000)
}

function averageLine(average: AverageCost | undefined) {
  if (!average) return ''
  if (average.lines > 1) {
    const purchases = `${countText(average.lines)} purchases`
    return `Average ${money(average.average)} each across ${purchases}, ${countText(average.quantity)} on hand, before tax and shipping`
  }
  if (average.fees > 0) return `${money(average.average)} each, before tax and shipping`
  return ''
}

function LotRow({ lot, quote, photo, average, onTrack }: { lot: Lot; quote: Quote | undefined; photo?: string; average?: AverageCost; onTrack: () => void }) {
  const { openDraft } = useShop()
  const each = heldMarket(lot, quote)
  const openValue = each == null ? null : each * lot.remaining - lot.costLeft
  const soldOut = lot.remaining <= 0
  const proceeds = roundMoney(lot.sales.reduce((sum, sale) => sum + lineCash(sale), 0))
  const profit = roundMoney(proceeds - lot.unitCost * lot.soldQty)
  const bought = roundMoney(lot.unitCost * Number(lot.buy.quantity))
  const paid = averageLine(average)
  const image = quote?.imageUrl || photo || null
  return (
    <article className="lot">
      <Thumb src={image} name={lot.buy.title} />
      <div>
        <p className="row-title">{lot.buy.title}</p>
        <p className="row-sub">
          {[
            kindLabel(lot.buy),
            lot.buy.detail,
            soldOut ? 'Sold' : `${lot.remaining} left`,
            soldOut ? `bought ${money(bought)}` : `cost ${money(lot.costLeft)}`,
            lot.buy.orderId ? 'Same order' : '',
          ].filter(Boolean).join(' · ')}
        </p>
        {paid ? <p className="quiet">{paid}</p> : null}
        {lot.buy.arrivesOn ? (
          <p className="quiet">{lot.buy.arrivesOn > todayISO() ? 'Arrives' : 'Arrived'} {prettyDate(lot.buy.arrivesOn)}</p>
        ) : null}
        {lot.buy.trackingNumber ? (
          <p className="quiet">{carrierLabel(lot.buy.trackingCarrier)} · {lot.buy.trackingNumber}</p>
        ) : null}
        {soldOut ? (
          <p className={`quiet ${tone(profit)}`}>Took {money(proceeds)} · {signedMoney(profit)}</p>
        ) : each == null ? (
          <p className="quiet">No market price on this line.</p>
        ) : (
          <p className={`quiet ${tone(openValue || 0)}`}>
            Market {money(each)} each · open {signedMoney(openValue || 0)}
          </p>
        )}
      </div>
      <div className="lot-actions">
        <button type="button" className="btn ghost" onClick={onTrack}>
          {lot.buy.trackingNumber ? 'Open tracking' : 'Add tracking'}
        </button>
        {lot.remaining > 0 ? (
          <button type="button" className="btn" onClick={() => openDraft({ mode: 'sell', buy: lot.buy })}>Sell</button>
        ) : null}
        <button type="button" className="btn ghost" onClick={() => openDraft({ mode: 'edit', entry: lot.buy })}>Edit</button>
      </div>
    </article>
  )
}

function TrackingSheet({ lot, onClose }: { lot: Lot; onClose: () => void }) {
  const { saveEntry } = useShop()
  const [number, setNumber] = useState(lot.buy.trackingNumber || '')
  const [carrier, setCarrier] = useState(lot.buy.trackingCarrier || '')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const chosen = carrier || (number.trim() ? guessCarrier(number) : '')
  const href = trackingUrl(chosen, number)

  async function onSave() {
    setSaving(true)
    setError(null)
    try {
      await saveEntry({
        direction: lot.buy.direction,
        itemKind: lot.buy.itemKind,
        title: lot.buy.title,
        detail: lot.buy.detail,
        quantity: lot.buy.quantity,
        unitAmount: lot.buy.unitAmount,
        fees: lot.buy.fees,
        occurredOn: lot.buy.occurredOn,
        notes: lot.buy.notes,
        productId: lot.buy.productId,
        subtype: lot.buy.subtype,
        boxesPerCase: lot.buy.boxesPerCase,
        lotId: lot.buy.lotId,
        shopId: lot.buy.shopId,
        trackingNumber: number.trim() || null,
        trackingCarrier: number.trim() ? chosen || 'other' : null,
        arrivesOn: lot.buy.arrivesOn,
        orderId: lot.buy.orderId,
      }, lot.buy.id)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save that tracking number.')
      setSaving(false)
    }
  }

  return (
    <div className="backdrop" onMouseDown={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-labelledby="track-title" onMouseDown={(event) => event.stopPropagation()}>
        <div className="grab" aria-hidden="true" />
        <div className="sheet-head">
          <h2 id="track-title">Tracking</h2>
          <button type="button" className="btn ghost" onClick={onClose}>Close</button>
        </div>
        <p className="quiet">{lot.buy.title}</p>
        <label className="field">
          Tracking number
          <input
            value={number}
            onChange={(event) => {
              const next = event.target.value
              setNumber(next)
              if (!carrier && next.trim()) setCarrier(guessCarrier(next))
            }}
            placeholder="Paste the number from the seller"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
          />
        </label>
        <label className="field">
          Carrier
          <select value={carrier} onChange={(event) => setCarrier(event.target.value)}>
            <option value="">Choose</option>
            {CARRIERS.map((item) => (
              <option key={item.id} value={item.id}>{item.label}</option>
            ))}
          </select>
        </label>
        {error ? <p className="error-text">{error}</p> : null}
        <div className="action-row">
          <button type="button" className="btn" onClick={onSave} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
          {href ? (
            <a className="btn ghost" href={href} target="_blank" rel="noreferrer">Open tracking</a>
          ) : null}
        </div>
      </div>
    </div>
  )
}
