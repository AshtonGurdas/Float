import { useEffect, useMemo, useState } from 'react'
import { prettyDate } from '../lib/format.ts'

type ShowEvent = {
  name: string
  start: string
  end: string
  city: string
  venue: string
  fee: string | null
  free: boolean | null
  note: string
  url: string
}

function whenLabel(event: ShowEvent) {
  if (event.start === event.end) return prettyDate(event.start)
  return `${prettyDate(event.start)} – ${prettyDate(event.end)}`
}

export function EventsPage() {
  const [events, setEvents] = useState<ShowEvent[]>([])
  const [city, setCity] = useState('All')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let live = true
    fetch('/api/events')
      .then(async (response) => {
        const body = await response.json().catch(() => ({}))
        if (!response.ok) throw new Error(body.error || 'Could not load events.')
        return body.events as ShowEvent[]
      })
      .then((next) => {
        if (live) setEvents(next || [])
      })
      .catch((err: unknown) => {
        if (live) setError(err instanceof Error ? err.message : 'Could not load events.')
      })
      .finally(() => {
        if (live) setLoading(false)
      })
    return () => {
      live = false
    }
  }, [])

  const cities = useMemo(() => {
    return ['All', ...Array.from(new Set(events.map((event) => event.city).filter(Boolean))).sort()]
  }, [events])
  const visible = city === 'All' ? events : events.filter((event) => event.city === city)

  return (
    <section>
      <header className="page-head">
        <div>
          <p className="kicker">British Columbia</p>
          <h1>Events</h1>
        </div>
      </header>
      <p className="quiet">
        Card shows coming up in B.C. The door fee is shown when the listing includes it. Check the show page before you go, since prices can change.
      </p>
      <div className="chips" role="group" aria-label="City">
        {cities.map((name) => (
          <button key={name} type="button" className="chip" aria-pressed={city === name} onClick={() => setCity(name)}>
            {name}
          </button>
        ))}
      </div>
      {loading ? <p className="quiet">Loading shows…</p> : null}
      {error ? <p className="error-text">{error}</p> : null}
      {!loading && !error && visible.length === 0 ? <p className="quiet">No upcoming shows in this list.</p> : null}
      <div className="ledger">
        {visible.map((event) => (
          <article key={`${event.name}-${event.start}`} className="shop-row">
            <p className="row-title">{event.name}</p>
            <p className="row-sub">{whenLabel(event)}</p>
            <p className="row-sub">{[event.city, event.venue].filter(Boolean).join(' · ')}</p>
            <p className={event.free ? 'shop-again again-yes' : event.fee ? 'shop-again again-maybe' : 'row-sub'}>
              {event.free ? 'Free to enter' : event.fee ? `Entry: ${event.fee}` : 'Entry fee not listed'}
            </p>
            {event.note ? <p className="row-sub">{event.note}</p> : null}
            <a className="text-btn" href={event.url} target="_blank" rel="noreferrer">Show page</a>
          </article>
        ))}
      </div>
    </section>
  )
}
