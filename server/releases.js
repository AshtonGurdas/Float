import { findPicture } from '../shared/art.js'
import { RELEASE_GAMES, RECENT_DAYS, addCenterRows, catalogRows, centerRows, collapseVariants, distributorRows, mergeReleases, onePieceProductRows, pokemonArticleRows, pokemonCenterRows, riftboundAnnouncementRows, rowsForGroup, shiftDate, sortReleases } from '../shared/releases.js'
import { loadArt } from './art.js'
import { sleep, tcg } from './tcg.js'

const DISTRIBUTOR = 'https://ca.universaldist.com/api/v1/en/preorderproducts?limit=2000'
const STAMP_URL = 'https://tcgcsv.com/last-updated.txt'
const TCG_CACHE_MS = 26 * 60 * 60 * 1000
const OFFICIAL_CACHE_MS = 60 * 60 * 1000
const PAGE_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'
const ONE_PIECE_PAGES = [
  'https://en.onepiece-cardgame.com/products/?subcategory=all',
  'https://en.onepiece-cardgame.com/products/?subcategory=boosters',
  'https://en.onepiece-cardgame.com/products/?subcategory=decks',
  'https://en.onepiece-cardgame.com/products/?subcategory=others',
]
const RIOT_NEWS = 'https://playriftbound.com/en-us/news/announcements/'
const RIOT_SEED = 'https://playriftbound.com/en-us/news/announcements/products-and-sets-into-2027/'
const POKEMON_NEWS = 'https://www.pokemon.com/us/pokemon-news'
const CENTER_ARTICLE = 'https://support.pokemoncenter.com/api/v2/help_center/en-us/articles/4407702295572.json'
let cache = null
let officialCache = null
let pendingTcg = null

function vancouverToday() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Vancouver',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

async function mapLimit(items, limit, worker) {
  const results = new Array(items.length)
  let next = 0
  async function run() {
    while (next < items.length) {
      const index = next
      next += 1
      results[index] = await worker(items[index])
    }
  }
  const workers = Math.min(limit, items.length)
  if (!workers) return results
  await Promise.all(Array.from({ length: workers }, () => run()))
  return results
}

async function catalogStamp() {
  const response = await fetch(STAMP_URL, {
    headers: {
      Accept: 'text/plain',
      'User-Agent': 'Float/1.0 (personal TCG shop books; https://github.com/AshtonGurdas/Float)',
    },
    signal: AbortSignal.timeout(10000),
  })
  if (!response.ok) throw new Error(`TCGCSV stamp ${response.status}`)
  return (await response.text()).trim()
}

// New sealed product is often added to an older set, so the set date alone is not enough.
async function gameRows(game, today, earliest) {
  const payload = await tcg(`/${game.categoryId}/groups`)
  const groups = payload.results || []
  if (!groups.length) return { rows: [], failed: 1 }
  let failed = 0
  const lists = await mapLimit(groups, 4, async (group) => {
    await sleep(80)
    try {
      const body = await tcg(`/${game.categoryId}/${group.groupId}/products`)
      return rowsForGroup(game, group, body.results || [], today, earliest)
    } catch {
      failed += 1
      return []
    }
  })
  return { rows: lists.flat(), failed }
}

async function loadTcg(today, earliest) {
  const rows = []
  let failed = 0
  for (const game of RELEASE_GAMES) {
    const result = await gameRows(game, today, earliest)
    failed += result.failed
    rows.push(...result.rows)
  }
  return { rows, failed }
}

async function distributorFeed() {
  const response = await fetch(DISTRIBUTOR, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'Float/1.0 (personal TCG shop books; https://github.com/AshtonGurdas/Float)',
    },
    signal: AbortSignal.timeout(15000),
  })
  if (!response.ok) throw new Error(`Universal Distribution ${response.status}`)
  const payload = await response.json()
  return Array.isArray(payload) ? payload : []
}

async function page(url, accept = 'text/html') {
  const response = await fetch(url, {
    headers: { 'User-Agent': PAGE_UA, Accept: accept },
    signal: AbortSignal.timeout(12000),
  })
  if (!response.ok) throw new Error(`${response.status} for ${url}`)
  return response.text()
}

function riotLinks(html) {
  const links = new Set([RIOT_SEED])
  for (const match of String(html || '').matchAll(/\/en-us\/news\/announcements\/([a-z0-9-]+)\/?/gi)) {
    const slug = match[1]
    if (/faq|rules|errata|changelog|patch|drawing|ban-list/.test(slug)) continue
    links.add(`https://playriftbound.com/en-us/news/announcements/${slug}/`)
  }
  return [...links].slice(0, 8)
}

function pokemonLinks(html) {
  const links = new Set()
  for (const match of String(html || '').matchAll(/href="(\/us\/news\/[^"]+)"/gi)) {
    if (!/product-release/i.test(match[1])) continue
    links.add(new URL(match[1], 'https://www.pokemon.com').href)
  }
  return [...links].slice(0, 4)
}

async function loadOfficial(today, earliest) {
  const [onePiecePages, riotNews, pokemonNews, centerArticle] = await Promise.all([
    mapLimit(ONE_PIECE_PAGES, 4, async (url) => page(url).catch(() => '')),
    page(RIOT_NEWS).catch(() => ''),
    page(POKEMON_NEWS).catch(() => ''),
    page(CENTER_ARTICLE, 'application/json').catch(() => ''),
  ])
  const riotPages = await mapLimit(riotLinks(riotNews), 4, async (url) => {
    const html = await page(url).catch(() => '')
    return riftboundAnnouncementRows(html, url, today, earliest)
  })
  const pokemonPages = await mapLimit(pokemonLinks(pokemonNews), 4, async (url) => {
    const html = await page(url).catch(() => '')
    return pokemonArticleRows(html, url, today, earliest)
  })
  let centerHtml = ''
  try {
    const payload = JSON.parse(centerArticle)
    centerHtml = payload?.article?.body || ''
  } catch { /* the support article did not parse */ }
  const found = [
    ...onePiecePages.flatMap((html) => onePieceProductRows(html, today, earliest)),
    ...riotPages.flat(),
    ...pokemonPages.flat(),
    ...pokemonCenterRows(centerHtml, today, earliest),
  ]
  return found
}

async function officialFeed(today, earliest) {
  if (officialCache && officialCache.today === today && Date.now() - officialCache.at < OFFICIAL_CACHE_MS) {
    return officialCache.rows
  }
  try {
    const rows = await loadOfficial(today, earliest)
    officialCache = { at: Date.now(), today, rows }
    return rows
  } catch {
    return officialCache?.rows || []
  }
}

export async function listReleases() {
  const today = vancouverToday()
  const earliest = shiftDate(today, -RECENT_DAYS)
  const stamp = await catalogStamp().catch(() => null)
  const tcgFresh = Boolean(
    cache?.tcgRows &&
    ((stamp && cache.stamp === stamp) || (!stamp && Date.now() - cache.tcgAt < TCG_CACHE_MS)),
  )
  if (!tcgFresh && !pendingTcg) {
    pendingTcg = loadTcg(today, earliest).finally(() => {
      pendingTcg = null
    })
  }
  const [tcg, art, distributor, official] = await Promise.all([
    tcgFresh
      ? Promise.resolve({ rows: cache.tcgRows, failed: 0 })
      : pendingTcg.catch((error) => {
          if (cache?.tcgRows) return { rows: cache.tcgRows, failed: 0, stale: true }
          throw error
        }),
    loadArt().catch(() => null),
    distributorFeed().then((rows) => ({ ok: true, rows })).catch(() => ({ ok: false, rows: [] })),
    officialFeed(today, earliest).catch(() => officialCache?.rows || []),
  ])
  const udRows = distributor.ok ? distributor.rows : (cache?.udRows || [])
  const announced = catalogRows(official)
  const center = centerRows(official)
  const products = collapseVariants(sortReleases(addCenterRows(
    mergeReleases(tcg.rows, [...distributorRows(udRows, today, earliest), ...announced]),
    center,
  ))).map((row) => {
    if (row.imageUrl) return row
    const imageUrl = findPicture(art, row)
    return imageUrl ? { ...row, imageUrl } : row
  })
  if (!tcg.stale && tcg.failed <= 2 && products.length) {
    cache = {
      stamp: stamp || cache?.stamp || null,
      tcgAt: Date.now(),
      tcgRows: tcg.rows,
      udRows: distributor.ok ? distributor.rows : (cache?.udRows || []),
    }
  } else if (distributor.ok && cache) {
    cache = { ...cache, udRows: distributor.rows }
  }
  return { source: 'tcgplayer', updatedOn: today, products }
}
