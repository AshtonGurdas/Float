import { useMemo, useState } from 'react'
import { NetBars } from '../components/Chart.tsx'
import { cashOn, lineCash, monthBounds, monthNets, realized, saleTake, summarize, yearNets, type Entry } from '../lib/books.ts'
import { kindLabel, money, monthLabel, movementLabel, prettyDate, signedMoney, tone } from '../lib/format.ts'
import type { Customer, Shop } from '../lib/rows.ts'
import { useShop } from '../store.tsx'

const MONTHS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D']

export function BooksPage() {
  const { entries, shops, customers, loading, openDraft } = useShop()
  const now = new Date()
  const [period, setPeriod] = useState<'month' | 'year' | 'all'>('month')
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)

  const bounds = period === 'month' ? monthBounds(year, month) : period === 'year' ? { start: `${year}-01-01`, end: `${year}-12-31` } : null
  const stats = bounds ? summarize(entries, bounds.start, bounds.end) : summarize(entries)
  const profit = bounds ? realized(entries, bounds.start, bounds.end) : realized(entries)
  const years = useMemo(() => yearNets(entries), [entries])
  const showYears = period === 'all' && years.length > 1
  const bars = showYears ? years.map((item) => item.net) : monthNets(entries, year)
  const labels = showYears ? years.map((item) => item.year.slice(2)) : MONTHS
  const active = showYears ? years.findIndex((item) => Number(item.year) === year) : period === 'month' ? month - 1 : null

  const visible = entries.filter((entry) => {
    if (!bounds) return true
    const date = cashOn(entry)
    return date >= bounds.start && date <= bounds.end
  })
  const hidden = bounds
    ? entries.filter((entry) => {
        const date = cashOn(entry)
        return date < bounds.start || date > bounds.end
      })
    : []

  const horizon = now.getFullYear() * 12 + now.getMonth() + 1
  const atFuture = period === 'month'
    ? year * 12 + (month - 1) >= horizon
    : year >= now.getFullYear()

  function shift(delta: number) {
    if (period !== 'month') {
      setYear((current) => current + delta)
      return
    }
    const next = new Date(year, month - 1 + delta, 1)
    setYear(next.getFullYear())
    setMonth(next.getMonth() + 1)
  }

  const heading = period === 'all' ? 'All time' : period === 'year' ? String(year) : monthLabel(year, month)

  return (
    <section>
      <header className="page-head">
        <div>
          <p className="kicker">Cash</p>
          <h1>Books</h1>
        </div>
        <button type="button" className="icon-btn" aria-label="Add an entry" onClick={() => openDraft({ mode: 'create' })}>
          +
        </button>
      </header>
      <div className="seg" role="group" aria-label="Time range">
        <button type="button" aria-pressed={period === 'month'} onClick={() => setPeriod('month')}>Month</button>
        <button type="button" aria-pressed={period === 'year'} onClick={() => setPeriod('year')}>Year</button>
        <button type="button" aria-pressed={period === 'all'} onClick={() => setPeriod('all')}>All</button>
      </div>
      <div className="monthbar">
        <button type="button" className="icon-btn" aria-label="Previous" onClick={() => shift(-1)}>‹</button>
        <strong>{heading}</strong>
        <button type="button" className="icon-btn" aria-label="Next" onClick={() => shift(1)} disabled={atFuture || period === 'all'}>›</button>
      </div>
      <div className="hero">
        <p className="hero-label">Net</p>
        <p className={`hero-num num ${tone(stats.net)}`}>{signedMoney(stats.net)}</p>
        <div className="split three">
          <div>
            <span>Spent</span>
            <strong className="num down">{money(stats.spent)}</strong>
          </div>
          <div>
            <span>Made</span>
            <strong className="num up">{money(stats.made)}</strong>
          </div>
          <div>
            <span>Profit</span>
            <strong className={`num ${tone(profit.total)}`}>{signedMoney(profit.total)}</strong>
          </div>
        </div>
        <p className="quiet">Net is made minus spent. Profit is only what you kept on cards you sold. A credit purchase counts on next month's bill.</p>
      </div>
      <NetBars
        values={bars}
        labels={labels}
        active={active}
        onPick={(index) => {
          if (showYears) {
            setYear(Number(years[index].year))
            setPeriod('year')
            return
          }
          setMonth(index + 1)
          setPeriod('month')
        }}
      />
      {loading ? <p className="quiet">Loading your books…</p> : null}
      {!loading && visible.length === 0 ? (
        <div className="empty">
          <p>{hidden.length ? `Nothing in ${heading}.` : 'Nothing in this range yet.'}</p>
          {hidden.length ? (
            <p>Purchases from other months are listed below. They are not in these totals.</p>
          ) : (
            <p>Add a card you bought, or a case of booster boxes.</p>
          )}
          <button type="button" className="btn" onClick={() => openDraft({ mode: 'create' })}>Add an entry</button>
        </div>
      ) : null}
      {!loading && visible.length > 0 ? (
        <Ledger rows={visible} entries={entries} shops={shops} customers={customers} onOpen={openDraft} />
      ) : null}
      {!loading && hidden.length > 0 ? (
        <>
          <p className="quiet ledger-note">Outside {heading}. Not counted in the totals above.</p>
          <Ledger rows={hidden} entries={entries} shops={shops} customers={customers} onOpen={openDraft} />
        </>
      ) : null}
    </section>
  )
}

function Ledger({
  rows,
  entries,
  shops,
  customers,
  onOpen,
}: {
  rows: Entry[]
  entries: Entry[]
  shops: Shop[]
  customers: Customer[]
  onOpen: (draft: { mode: 'edit'; entry: Entry }) => void
}) {
  const buys = new Map(entries.map((entry) => [entry.id, entry]))
  const grouped = new Map<string, { key: string; sort: string; label: string; rows: Entry[] }>()
  for (const entry of rows) {
    const credit = entry.direction === 'out' && entry.paidWith === 'credit'
    const cash = cashOn(entry)
    const key = credit ? `credit:${cash.slice(0, 7)}` : entry.occurredOn
    let group = grouped.get(key)
    if (!group) {
      const [billYear, billMonth] = cash.slice(0, 7).split('-').map(Number)
      group = {
        key,
        sort: credit ? `${cash.slice(0, 7)}-32` : entry.occurredOn,
        label: credit ? `Credit · ${monthLabel(billYear, billMonth)}` : prettyDate(entry.occurredOn),
        rows: [],
      }
      grouped.set(key, group)
    }
    group.rows.push(entry)
  }
  const ordered = [...grouped.values()].sort((a, b) => b.sort.localeCompare(a.sort))
  return (
    <div className="ledger">
      {ordered.map((group) => (
        <div key={group.key}>
          <p className="day-label">{group.label}</p>
          {group.rows.map((entry) => {
            const cash = lineCash(entry)
            const take = entry.lotId ? saleTake(buys.get(entry.lotId), entry) : null
            const signed = take ? take.profit : entry.direction === 'out' ? -cash : cash
            const bits = [movementLabel(entry), kindLabel(entry)]
            if (entry.direction === 'out' && entry.paidWith === 'credit') bits.push(`Bought ${prettyDate(entry.occurredOn)}`)
            if (entry.detail) bits.push(entry.detail)
            if (entry.quantity !== 1) bits.push(`${entry.quantity} × ${money(entry.unitAmount)}`)
            if (take) bits.push(`cost ${money(take.cost)}`)
            const shopName = shops.find((shop) => shop.id === entry.shopId)?.name
            if (shopName) bits.push(shopName)
            const buyer = customers.find((customer) => customer.id === entry.customerId)?.name
            if (buyer) bits.push(buyer)
            if (entry.orderId) bits.push('Same order')
            return (
              <button key={entry.id} type="button" className="row" onClick={() => onOpen({ mode: 'edit', entry })}>
                <span>
                  <span className="row-title">{entry.title}</span>
                  <span className="row-sub">{bits.join(' · ')}</span>
                </span>
                <span className="row-amt num">
                  <span className={tone(signed)}>{signedMoney(signed)}</span>
                  {take ? <span className="row-sub">took {money(take.proceeds)}</span> : null}
                </span>
              </button>
            )
          })}
        </div>
      ))}
    </div>
  )
}
