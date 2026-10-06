import { useEffect, useMemo, useState } from 'react'
import { Thumb } from '../components/Thumb.tsx'

type ReleaseProduct = {
  productId: number | null
  name: string
  game: string
  gameName: string
  setName: string
  abbreviation: string | null
  releasedOn: string
  status: 'coming' | 'out'
  imageUrl: string | null
  url: string | null
  linkLabel?: string | null
  note: string | null
}

const GAMES = [
  { key: 'all', name: 'All' },
  { key: 'pokemon', name: 'Pokémon' },
  { key: 'onepiece', name: 'One Piece' },
  { key: 'riftbound', name: 'Riftbound' },
]

function releaseDate(iso: string) {
  const [year, month, day] = iso.split('-').map(Number)
  return new Date(year, month - 1, day).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function setLabel(item: ReleaseProduct) {
  const abbr = item.abbreviation
  if (abbr && !item.setName.toUpperCase().includes(abbr.toUpperCase())) return `${item.setName} (${abbr})`
  return item.setName
}

export function ReleasesPage() {
  const [products, setProducts] = useState<ReleaseProduct[]>([])
  const [game, setGame] = useState('all')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let live = true
    fetch('/api/releases')
      .then(async (response) => {
        const body = await response.json().catch(() => ({}))
        if (!response.ok) throw new Error(body.error || 'Could not load releases.')
        return body.products as ReleaseProduct[]
      })
      .then((next) => {
        if (live) setProducts(next || [])
      })
      .catch((err: unknown) => {
        if (live) setError(err instanceof Error ? err.message : 'Could not load releases.')
      })
      .finally(() => {
        if (live) setLoading(false)
      })
    return () => {
      live = false
    }
  }, [])

  const visible = useMemo(() => {
    return game === 'all' ? products : products.filter((item) => item.game === game)
  }, [game, products])

  let previous = ''

  return (
    <section>
      <header className="page-head">
        <div>
          <p className="kicker">Pokémon, One Piece, Riftbound</p>
          <h1>Releases</h1>
        </div>
      </header>
      <p className="quiet">
        Ship dates come from TCGplayer when the product is in their catalog, and from Universal Distribution’s preorder list when it is not. A date can move before the product lands, and anything from the last few weeks stays here marked Out.
      </p>
      <div className="chips" role="group" aria-label="Game">
        {GAMES.map((item) => (
          <button key={item.key} type="button" className="chip" aria-pressed={game === item.key} onClick={() => setGame(item.key)}>
            {item.name}
          </button>
        ))}
      </div>
      {loading ? <p className="quiet">Loading releases…</p> : null}
      {error ? <p className="error-text">{error}</p> : null}
      {!loading && !error && visible.length === 0 ? <p className="quiet">Nothing in this list is scheduled right now.</p> : null}
      <div className="ledger">
        {visible.map((item) => {
          const heading = `${item.releasedOn}:${item.status}`
          const showHeading = heading !== previous
          previous = heading
          return (
            <div key={`${item.game}-${item.productId ?? item.name}-${item.releasedOn}`}>
              {showHeading ? (
                <h2 className="release-day">
                  {releaseDate(item.releasedOn)}
                  <span className={item.status === 'coming' ? 'shop-again again-maybe' : 'shop-again again-yes'}>
                    {item.status === 'coming' ? 'Coming' : 'Out'}
                  </span>
                </h2>
              ) : null}
              <article className="lot">
                <Thumb src={item.imageUrl} name={item.name} />
                <div>
                  <p className="row-title">{item.name}</p>
                  <p className="row-sub">{item.gameName} · {setLabel(item)}</p>
                  {item.note ? <p className="row-sub">{item.note}</p> : null}
                  {item.url ? <a className="text-btn" href={item.url} target="_blank" rel="noreferrer">{item.linkLabel || 'TCGplayer'}</a> : null}
                </div>
              </article>
            </div>
          )
        })}
      </div>
    </section>
  )
}
