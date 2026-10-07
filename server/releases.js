import { findPicture } from '../shared/art.js'
import { RELEASE_GAMES, RECENT_DAYS, collapseVariants, distributorRows, mergeReleases, rowsForGroup, shiftDate, sortReleases } from '../shared/releases.js'
import { loadArt } from './art.js'
import { sleep, tcg } from './tcg.js'

const DISTRIBUTOR = 'https://ca.universaldist.com/api/v1/en/preorderproducts?limit=2000'
const STAMP_URL = 'https://tcgcsv.com/last-updated.txt'
const TCG_CACHE_MS = 26 * 60 * 60 * 1000
let cache = null
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
  const [tcg, art, distributor] = await Promise.all([
    tcgFresh
      ? Promise.resolve({ rows: cache.tcgRows, failed: 0 })
      : pendingTcg.catch((error) => {
          if (cache?.tcgRows) return { rows: cache.tcgRows, failed: 0, stale: true }
          throw error
        }),
    loadArt().catch(() => null),
    distributorFeed().then((rows) => ({ ok: true, rows })).catch(() => ({ ok: false, rows: [] })),
  ])
  const udRows = distributor.ok ? distributor.rows : (cache?.udRows || [])
  const products = collapseVariants(sortReleases(mergeReleases(tcg.rows, distributorRows(udRows, today, earliest)))).map((row) => {
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
