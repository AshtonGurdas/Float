// Bank of Canada publishes one USD to CAD rate each business day.
const URL = 'https://www.bankofcanada.ca/valet/observations/FXUSDCAD/json?recent=1'
const FRESH = 6 * 60 * 60 * 1000
const KEEP = 7 * 24 * 60 * 60 * 1000

let cached = null

function failed(message) {
  const error = new Error(message)
  error.status = 502
  return error
}

async function load() {
  const response = await fetch(URL, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'Float/1.0 (personal TCG shop books; https://github.com/AshtonGurdas/Float)',
    },
    signal: AbortSignal.timeout(10000),
  })
  if (!response.ok) throw failed('Could not load the Canadian exchange rate.')
  const body = await response.json()
  const row = Array.isArray(body?.observations) ? body.observations[0] : null
  const rate = Number(row?.FXUSDCAD?.v)
  const asOf = String(row?.d || '')
  if (!Number.isFinite(rate) || rate < 0.8 || rate > 2 || !/^\d{4}-\d{2}-\d{2}$/.test(asOf)) {
    throw failed('The Canadian exchange rate did not look right.')
  }
  return { usdCad: rate, asOf }
}

export async function usdCad() {
  if (cached && Date.now() - cached.at < FRESH) return { usdCad: cached.usdCad, asOf: cached.asOf }
  try {
    const next = await load()
    cached = { ...next, at: Date.now() }
    return next
  } catch (error) {
    if (cached && Date.now() - cached.at < KEEP) return { usdCad: cached.usdCad, asOf: cached.asOf }
    throw error
  }
}
