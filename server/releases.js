import { findPicture } from '../shared/art.js'
import { RELEASE_GAMES, RECENT_DAYS, calendarDate, collapseVariants, distributorRows, mergeReleases, rowsForGroup, shiftDate, sortReleases } from '../shared/releases.js'
import { loadArt } from './art.js'
import { tcg } from './tcg.js'

const DISTRIBUTOR = 'https://ca.universaldist.com/api/v1/en/preorderproducts?limit=2000'

const CACHE_MS = 6 * 60 * 60 * 1000
let cache = null

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

async function gameRows(game, today, earliest) {
  const payload = await tcg(`/${game.categoryId}/groups`)
  const groups = (payload.results || []).filter((group) => {
    const date = calendarDate(group.publishedOn)
    return date && date >= earliest
  })
  const lists = await mapLimit(groups, 4, async (group) => {
    const body = await tcg(`/${game.categoryId}/${group.groupId}/products`)
    return rowsForGroup(game, group, body.results || [], today, earliest)
  })
  return lists.flat()
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

export async function listReleases() {
  if (cache && Date.now() - cache.at < CACHE_MS && cache.products.length) {
    return { source: 'tcgplayer', updatedOn: cache.updatedOn, products: cache.products }
  }
  const today = vancouverToday()
  const earliest = shiftDate(today, -RECENT_DAYS)
  const [lists, art, distributor] = await Promise.all([
    Promise.all(RELEASE_GAMES.map((game) => gameRows(game, today, earliest))),
    loadArt().catch(() => null),
    distributorFeed().then((rows) => ({ ok: true, rows })).catch(() => ({ ok: false, rows: [] })),
  ])
  const products = collapseVariants(sortReleases(mergeReleases(lists.flat(), distributorRows(distributor.rows, today, earliest)))).map((row) => {
    if (row.imageUrl) return row
    const imageUrl = findPicture(art, row)
    return imageUrl ? { ...row, imageUrl } : row
  })
  if (products.length && distributor.ok) cache = { at: Date.now(), updatedOn: today, products }
  return { source: 'tcgplayer', updatedOn: today, products }
}
