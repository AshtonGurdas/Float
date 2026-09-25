// TCGCSV republishes TCGplayer's catalog once a day. Pull it from the server, not the browser.
const BASE = 'https://tcgcsv.com/tcgplayer'
const UA = 'Float/1.0 (personal TCG shop books; https://github.com/AshtonGurdas/Float)'

export async function tcg(path) {
  const response = await fetch(`${BASE}${path}`, {
    headers: {
      Accept: 'application/json',
      'User-Agent': UA,
    },
    signal: AbortSignal.timeout(15000),
  })
  if (!response.ok) throw new Error(`TCGCSV ${response.status} for ${path}`)
  const payload = await response.json()
  if (payload && payload.success === false) {
    const detail = Array.isArray(payload.errors) ? payload.errors.filter(Boolean).join(', ') : ''
    throw new Error(detail || `TCGCSV failed for ${path}`)
  }
  return payload
}

export function utcDay() {
  return new Date().toISOString().slice(0, 10)
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function asNumber(value) {
  if (value == null || value === '') return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}
