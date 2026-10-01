import { useMemo, useState } from 'react'
import { NetBars } from '../components/Chart.tsx'
import { booksProfit, lineCash, monthBounds, monthProfits, saleTake, summarize, yearProfits } from '../lib/books.ts'
import { kindLabel, money, monthLabel, movementLabel, prettyDate, signedMoney, tone } from '../lib/format.ts'
import { useShop } from '../store.tsx'

const MONTHS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D']

export function BooksPage() {
  const { entries, shops, loading, openDraft } = useShop()
  const now = new Date()
  const [period, setPeriod] = useState<'month' | 'year' | 'all'>('month')
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)

  const bounds = period === 'month' ? monthBounds(year, month) : period === 'year' ? { start: `${year}-01-01`, end: `${year}-12-31` } : null
  const stats = bounds ? summarize(entries, bounds.start, bounds.end) : summarize(entries)
  const profit = bounds ? booksProfit(entries, bounds.start, bounds.end) : booksProfit(entries)
  const buys = useMemo(() => new Map(entries.map((entry) => [entry.id, entry])), [entries])
  const years = useMemo(() => yearProfits(entries), [entries])
  const showYears = period === 'all' && years.length > 1
  const bars = showYears ? years.map((item) => item.profit) : monthProfits(entries, year)
  const labels = showYears ? years.map((item) => item.year.slice(2)) : MONTHS
  const active = showYears ? years.findIndex((item) => Number(item.year) === year) : period === 'month' ? month - 1 : null

  const visible = entries.filter((entry) => {
    if (!bounds) return true
    return entry.occurredOn >= bounds.start && entry.occurredOn <= bounds.end
  })
  const grouped = new Map<string, typeof visible>()
  for (const entry of visible) {
    const list = grouped.get(entry.occurredOn) || []
    list.push(entry)
    grouped.set(entry.occurredOn, list)
  }

  const atFuture = period === 'month'
    ? year > now.getFullYear() || (year === now.getFullYear() && month >= now.getMonth() + 1)
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
        <p className="hero-label">Profit</p>
        <p className={`hero-num num ${tone(profit.total)}`}>{signedMoney(profit.total)}</p>
        <div className="split">
          <div>
            <span>Spent</span>
            <strong className="num down">{money(stats.spent)}</strong>
          </div>
          <div>
            <span>Made</span>
            <strong className="num up">{money(stats.made)}</strong>
          </div>
        </div>
        <p className="quiet">Profit is what you kept after the cost of what you sold. Spent and made are the cash.</p>
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
          <p>Nothing in this range yet.</p>
          <p>Add a card you bought, or a case of booster boxes.</p>
          <button type="button" className="btn" onClick={() => openDraft({ mode: 'create' })}>Add an entry</button>
        </div>
      ) : (
        <div className="ledger">
          {[...grouped.entries()].map(([date, rows]) => (
            <div key={date}>
              <p className="day-label">{prettyDate(date)}</p>
              {rows.map((entry) => {
                const cash = lineCash(entry)
                const take = entry.lotId ? saleTake(buys.get(entry.lotId), entry) : null
                const signed = take ? take.profit : entry.direction === 'out' ? -cash : cash
                const bits = [movementLabel(entry), kindLabel(entry)]
                if (entry.detail) bits.push(entry.detail)
                if (entry.quantity !== 1) bits.push(`${entry.quantity} × ${money(entry.unitAmount)}`)
                if (take) bits.push(`cost ${money(take.cost)}`)
                const shopName = shops.find((shop) => shop.id === entry.shopId)?.name
                if (shopName) bits.push(shopName)
                if (entry.orderId) bits.push('Same order')
                return (
                  <button key={entry.id} type="button" className="row" onClick={() => openDraft({ mode: 'edit', entry })}>
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
      )}
    </section>
  )
}
