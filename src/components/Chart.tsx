import { useId } from 'react'
import { money } from '../lib/format.ts'

export function Spark({ values, tone }: { values: number[]; tone: 'up' | 'down' | 'flat' }) {
  if (values.length < 2) return <span className="spark spark-empty" aria-hidden="true" />
  const width = 72
  const height = 28
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  const d = values
    .map((value, index) => {
      const x = (index / (values.length - 1)) * width
      const y = height - ((value - min) / span) * (height - 2) - 1
      return `${index === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`
    })
    .join(' ')
  return (
    <svg className={`spark spark-${tone}`} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      <path d={d} />
    </svg>
  )
}

export function PriceChart({ points }: { points: { date: string; market: number }[] }) {
  const rawId = useId()
  const id = rawId.replace(/:/g, '')
  if (points.length < 2) {
    return <p className="quiet">One price so far. Float keeps a point each day this stays on your list, so the move shows up after the next update.</p>
  }
  const values = points.map((point) => point.market)
  const first = values[0]
  const last = values[values.length - 1]
  const tone = last > first ? 'up' : last < first ? 'down' : 'flat'
  const width = 640
  const height = 180
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  const coords = values.map((value, index) => {
    const x = (index / (values.length - 1)) * width
    const y = height - ((value - min) / span) * (height - 16) - 8
    return [x, y] as const
  })
  const line = coords.map(([x, y], index) => `${index === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ')
  const area = `${line} L${width} ${height} L0 ${height} Z`
  return (
    <svg className={`price-chart tone-${tone}`} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Price from ${money(first)} to ${money(last)}`}>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.28" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${id})`} stroke="none" />
      <path d={line} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}

export function NetBars({
  values,
  labels,
  active,
  onPick,
}: {
  values: number[]
  labels: string[]
  active: number | null
  onPick: (index: number) => void
}) {
  const peak = Math.max(...values.map((value) => Math.abs(value)), 1)
  const diverges = values.some((value) => value < 0)
  return (
    <div className={`bars ${diverges ? 'diverges' : ''}`}>
      {values.map((value, index) => {
        const height = Math.max(4, (Math.abs(value) / peak) * (diverges ? 46 : 100))
        return (
          <button
            key={`${labels[index]}-${index}`}
            type="button"
            className={`bar-col ${active === index ? 'is-active' : ''}`}
            onClick={() => onPick(index)}
            aria-pressed={active === index}
            aria-label={`${labels[index]} ${money(value)}`}
          >
            <span className="bar-track">
              <span className={`bar ${value < 0 ? 'down' : 'up'}`} style={{ height: `${height}%` }} />
            </span>
            <span className="bar-label">{labels[index]}</span>
          </button>
        )
      })}
    </div>
  )
}
