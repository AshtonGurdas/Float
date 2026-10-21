import { useEffect, useState } from 'react'
import { cadRate, type CadRate } from './api.ts'

export function useCadRate() {
  const [rate, setRate] = useState<CadRate | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  useEffect(() => {
    let live = true
    cadRate()
      .then((data) => {
        if (!live) return
        if (!Number.isFinite(data.usdCad) || data.usdCad <= 0) {
          setState('error')
          return
        }
        setRate(data)
        setState('ready')
      })
      .catch(() => {
        if (live) setState('error')
      })
    return () => {
      live = false
    }
  }, [])
  return { rate, state }
}

export function rateLabel(rate: CadRate) {
  const figure = rate.usdCad.toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 4 })
  const [year, month, day] = rate.asOf.split('-').map(Number)
  const when = new Date(year, month - 1, day).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  return `${figure} on ${when}`
}
