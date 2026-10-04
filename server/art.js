import { parseOnePieceIndex, parseRiftboundArticle } from '../shared/art.js'

const CACHE_MS = 12 * 60 * 60 * 1000
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'

const ONE_PIECE_PAGES = [
  'https://en.onepiece-cardgame.com/products/?subcategory=all',
  'https://en.onepiece-cardgame.com/products/?subcategory=boosters',
  'https://en.onepiece-cardgame.com/products/?subcategory=decks',
  'https://en.onepiece-cardgame.com/products/?subcategory=others',
]

const RIFTBOUND_SEEDS = [
  'https://playriftbound.com/en-us/news/announcements/the-radiance-overview/',
  'https://playriftbound.com/en-us/news/announcements/the-vendetta-overview/',
  'https://playriftbound.com/en-us/news/announcements/the-unleashed-overview/',
  'https://playriftbound.com/en-us/news/announcements/products-and-sets-into-2027/',
]

let cache = null

async function page(url) {
  const response = await fetch(url, {
    headers: { 'User-Agent': UA, Accept: 'text/html' },
    signal: AbortSignal.timeout(12000),
  })
  if (!response.ok) throw new Error(`${response.status} for ${url}`)
  return response.text()
}

async function mapLimit(items, limit, worker) {
  const results = new Array(items.length)
  let next = 0
  async function run() {
    while (next < items.length) {
      const index = next
      next += 1
      results[index] = await worker(items[index], index)
    }
  }
  const workers = Math.min(limit, items.length)
  if (!workers) return results
  await Promise.all(Array.from({ length: workers }, () => run()))
  return results
}

function articleLinks(html) {
  const links = new Set(RIFTBOUND_SEEDS)
  for (const match of String(html || '').matchAll(/https:\/\/playriftbound\.com\/en-us\/news\/announcements\/[a-z0-9-]+\/?/gi)) {
    const url = match[0].endsWith('/') ? match[0] : `${match[0]}/`
    if (/overview|products-and-sets|into-2027/.test(url)) links.add(url)
  }
  return [...links].slice(0, 12)
}

async function fetchArt() {
  const [indexes, news] = await Promise.all([
    mapLimit(ONE_PIECE_PAGES, 4, async (url) => {
      try { return parseOnePieceIndex(await page(url)) } catch { return [] }
    }),
    page('https://playriftbound.com/en-us/news/').catch(() => ''),
  ])
  const articles = await mapLimit(articleLinks(news), 4, async (url) => {
    try { return parseRiftboundArticle(await page(url)) } catch { return [] }
  })
  const onepiece = []
  const seen = new Set()
  for (const item of indexes.flat()) {
    const key = `${item.code || item.title}|${item.url}`
    if (seen.has(key)) continue
    seen.add(key)
    onepiece.push(item)
  }
  const riftbound = []
  const shots = new Set()
  for (const shot of articles.flat()) {
    const key = `${shot.set}|${shot.kind}|${shot.url}`
    if (shots.has(key)) continue
    shots.add(key)
    riftbound.push(shot)
  }
  return { onepiece, riftbound }
}

export async function loadArt() {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.art
  try {
    const art = await fetchArt()
    if (art.onepiece.length || art.riftbound.length) cache = { at: Date.now(), art }
    return art
  } catch {
    return cache?.art || { onepiece: [], riftbound: [] }
  }
}

export function artForRows(rows) {
  const needs = (rows || []).some((row) => {
    if (!row) return false
    const game = row.game_key || row.game
    const sealed = row.sealed !== false && (row.sealed || /box|case|display|deck|bundle|kit|blister|collection/i.test(row.name || ''))
    return sealed && (game === 'onepiece' || game === 'riftbound')
  })
  return needs ? loadArt() : Promise.resolve(null)
}
