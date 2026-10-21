import { useEffect, useMemo, useState } from 'react'
import type { Quote } from '../lib/api.ts'
import { openEstimate, positions, roundMoney, type Entry, type Lot } from '../lib/books.ts'
import { money, monthLabel, parseMoney, prettyDate, signedMoney, todayISO, tone } from '../lib/format.ts'
import { lotMarket, quoteKey } from '../lib/market.ts'
import { entryFields } from '../lib/rows.ts'
import { useShop } from '../store.tsx'

function marketEach(lot: Lot, quotes: Record<string, Quote>) {
  if (!lot.buy.productId) return null
  const quote = quotes[quoteKey(lot.buy.productId, lot.buy.subtype)]
  if (!quote || quote.market == null) return null
  return lotMarket(lot.buy.itemKind, lot.buy.boxesPerCase, quote.name, quote.market)
}

function chosenEach(lot: Lot, quotes: Record<string, Quote>) {
  if (lot.buy.expectEach != null && !Number.isNaN(lot.buy.expectEach)) {
    return { each: lot.buy.expectEach, source: 'yours' as const }
  }
  const market = marketEach(lot, quotes)
  if (market != null) return { each: market, source: 'market' as const }
  return { each: null, source: 'none' as const }
}

function whenOf(entry: Entry, today: string) {
  const day = entry.arrivesOn
  if (!day) return { key: 'undated', sort: '2', label: 'No arrival day' }
  if (day <= today) return { key: 'hand', sort: '0', label: 'In hand' }
  const year = Number(day.slice(0, 4))
  const month = Number(day.slice(5, 7))
  return { key: day.slice(0, 7), sort: `1-${day.slice(0, 7)}`, label: monthLabel(year, month) }
}

function arrivalBit(entry: Entry, today: string) {
  if (!entry.arrivesOn) return null
  const verb = entry.arrivesOn <= today ? 'Arrived' : 'Arrives'
  return `${verb} ${prettyDate(entry.arrivesOn)}`
}

function centsSum(values: number[]) {
  return values.reduce((sum, value) => sum + Math.round(value * 100), 0) / 100
}

export function Estimate() {
  const { entries, quotes, saveEntry, setError } = useShop()
  const today = todayISO()
  const open = useMemo(() => positions(entries).filter((lot) => lot.remaining > 0), [entries])
  const estimate = useMemo(
    () => openEstimate(open, (lot) => chosenEach(lot, quotes).each),
    [open, quotes],
  )
  const byId = useMemo(() => new Map(estimate.lines.map((line) => [line.id, line])), [estimate.lines])
  const groups = useMemo(() => {
    const buckets = new Map<string, { key: string; sort: string; label: string; lots: Lot[] }>()
    for (const lot of open) {
      const when = whenOf(lot.buy, today)
      const bucket = buckets.get(when.key) || { ...when, lots: [] }
      bucket.lots.push(lot)
      buckets.set(when.key, bucket)
    }
    return [...buckets.values()]
      .sort((a, b) => a.sort.localeCompare(b.sort))
      .map((bucket) => {
        const lines = bucket.lots.map((lot) => byId.get(lot.buy.id)).filter((line) => line != null)
        const priced = lines.filter((line) => line.proceeds != null)
        return {
          ...bucket,
          proceeds: centsSum(priced.map((line) => line.proceeds || 0)),
          profit: centsSum(priced.map((line) => line.profit || 0)),
          missing: lines.length - priced.length,
        }
      })
  }, [open, today, byId])

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

  const headline = estimate.priced ? signedMoney(estimate.profit) : '—'

  return (
    <section aria-label="Profit calculator">
      <header className="page-head">
        <div>
          <p className="kicker">Guess</p>
          <h1>Profit calculator</h1>
        </div>
      </header>
      <div className="hero">
        <p className="hero-label">If you sold what's left</p>
        <p className={`hero-num num ${estimate.priced && estimate.profit < 0 ? 'down' : 'gold'}`}>{headline}</p>
        <div className="split">
          <div>
            <span>Might come in</span>
            <strong className="num">{estimate.priced ? money(estimate.proceeds) : '—'}</strong>
          </div>
          <div>
            <span>Still in them</span>
            <strong className="num">{estimate.priced ? money(estimate.cost) : '—'}</strong>
          </div>
        </div>
        <p className="quiet">
          A guess for the stock still on hand. Books keeps its own Profit, and that only counts a sale you already logged.
          A blank price uses the daily TCGplayer market, in US dollars.
          Type what you might get, such as a price from eBay.ca, and that number is used instead.
          {estimate.missing > 0 ? ` ${estimate.missing} still ${estimate.missing === 1 ? 'needs' : 'need'} a price, so ${estimate.missing === 1 ? 'it is' : 'they are'} left out.` : ''}
        </p>
      </div>
      {groups.map((group) => (
        <div key={group.key} className="estimate-group">
          <p className="day-label">{group.label}</p>
          <p className="quiet">
            {group.lots.length === group.missing
              ? 'Every line here still needs a price.'
              : `About ${money(group.proceeds)} in · ${signedMoney(group.profit)} after cost${group.missing ? ` · ${group.missing} still ${group.missing === 1 ? 'needs' : 'need'} a price` : ''}.`}
            {group.key === 'hand' ? ' Already due, so this is the part you could sell now.' : ''}
            {group.key === 'undated' ? ' No arrival day, so these are not on the calendar.' : ''}
          </p>
          {group.lots
            .slice()
            .sort((a, b) => (a.buy.arrivesOn || '').localeCompare(b.buy.arrivesOn || '') || a.buy.title.localeCompare(b.buy.title))
            .map((lot) => (
              <EstimateRow key={lot.buy.id} lot={lot} quotes={quotes} today={today} saveEntry={saveEntry} setError={setError} />
            ))}
        </div>
      ))}
    </section>
  )
}

function EstimateRow({
  lot,
  quotes,
  today,
  saveEntry,
  setError,
}: {
  lot: Lot
  quotes: Record<string, Quote>
  today: string
  saveEntry: ReturnType<typeof useShop>['saveEntry']
  setError: (message: string | null) => void
}) {
  const choice = chosenEach(lot, quotes)
  const market = marketEach(lot, quotes)
  const line = openEstimate([lot], () => choice.each).lines[0]
  const saved = lot.buy.expectEach
  const [text, setText] = useState(saved == null ? '' : String(saved))
  const [focused, setFocused] = useState(false)
  const [saving, setSaving] = useState(false)
  useEffect(() => {
    if (!focused) setText(saved == null ? '' : String(saved))
  }, [saved, focused])

  async function commit() {
    const parsed = parseMoney(text)
    if (Number.isNaN(parsed as number)) {
      setText(saved == null ? '' : String(saved))
      return
    }
    const next = parsed == null ? null : roundMoney(parsed)
    if ((next == null && saved == null) || (next != null && saved != null && Math.abs(next - saved) < 0.001)) return
    setSaving(true)
    try {
      await saveEntry({ ...entryFields(lot.buy), expectEach: next }, lot.buy.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save that price.')
    } finally {
      setSaving(false)
    }
  }

  const arrived = arrivalBit(lot.buy, today)
  const bits = [`${lot.remaining} left`, `cost ${money(lot.costLeft)}`]
  if (arrived) bits.push(arrived)
  const caption = choice.source === 'yours' && choice.each != null
    ? `Your price, ${money(choice.each)} each`
    : choice.source === 'market' && market != null
      ? `TCGplayer ${money(market)} each, US dollars`
      : 'No market price yet'

  return (
    <div className="estimate-row">
      <div>
        <p className="row-title">{lot.buy.title}</p>
        <p className="row-sub">{bits.join(' · ')}</p>
      </div>
      <div className="estimate-price">
        <label>
          Price each
          <input
            aria-label={`Price each for ${lot.buy.title}`}
            inputMode="decimal"
            value={text}
            placeholder={market != null ? String(market) : 'Your price'}
            onFocus={() => setFocused(true)}
            onBlur={() => {
              setFocused(false)
              void commit()
            }}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') event.currentTarget.blur()
            }}
          />
        </label>
        <p className={`estimate-result num ${line?.profit == null ? '' : tone(line.profit)}`}>
          {line?.profit == null ? 'Need a price' : signedMoney(line.profit)}
        </p>
        <p className="row-sub estimate-caption">{saving ? 'Saving…' : caption}</p>
      </div>
    </div>
  )
}
