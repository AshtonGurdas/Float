export const RELEASE_GAMES = [
  { key: 'pokemon', categoryId: 3, name: 'Pokémon' },
  { key: 'onepiece', categoryId: 68, name: 'One Piece' },
  { key: 'riftbound', categoryId: 89, name: 'Riftbound' },
]

export const RECENT_DAYS = 45

export function calendarDate(value) {
  const match = String(value || '').match(/^(\d{4}-\d{2}-\d{2})T00:00:00(?:Z)?$/)
  return match ? match[1] : null
}

export function shiftDate(iso, days) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''))
  if (!match) return null
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])))
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

function plain(value) {
  return String(value || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

function httpsUrl(value) {
  const text = String(value || '')
  return text.startsWith('https://') ? text : null
}

// TCGplayer leaves imageCount at 0 until the file is public. Those CDN URLs answer 403.
function listedImage(product) {
  if (!product || Number(product.imageCount) === 0) return null
  return httpsUrl(product.imageUrl)
}

export function keepProduct(name) {
  const text = plain(name).toLowerCase()
  if (!text) return false
  const pack = /booster pack/.test(text)
  if (pack && !/case|display|bundle|box/.test(text)) return false
  if (/single pack blister/.test(text)) return false
  return /box|case|display|deck|tin|bundle|collection|kit|blister|pack set/.test(text)
}

export function productRank(name) {
  const text = plain(name).toLowerCase()
  if (/half booster/.test(text)) return 2
  if (/booster box/.test(text) && !/case/.test(text)) return 0
  if (/booster display/.test(text) && !/case/.test(text)) return 1
  if (/elite trainer/.test(text) && !/case/.test(text)) return 3
  if (/(starter|showdown) deck/.test(text) && !/display|case/.test(text)) return 4
  if (/build (&|and) battle/.test(text)) return 5
  if (/bundle/.test(text) && !/case/.test(text)) return 6
  if (/case/.test(text)) return 7
  if (/display/.test(text)) return 8
  if (/deck|tin|collection|kit/.test(text)) return 9
  return 10
}

function isSealed(product) {
  const extended = product?.extendedData || []
  const has = (label) => extended.some((item) => {
    return String(item?.name || '').toLowerCase() === label && String(item?.value || '').trim()
  })
  return !has('number') && !has('rarity')
}

function rowFrom(game, group, product, setDate, earliest, today, note) {
  const releasedOn = calendarDate(product?.presaleInfo?.releasedOn) || setDate
  if (!releasedOn || releasedOn < earliest) return null
  const name = plain(product?.name) || plain(group.name)
  if (!name) return null
  return {
    productId: Number.isInteger(product?.productId) ? product.productId : null,
    name,
    game: game.key,
    gameName: game.name,
    setName: plain(group.name),
    abbreviation: plain(group.abbreviation) || null,
    releasedOn,
    status: releasedOn >= today ? 'coming' : 'out',
    imageUrl: listedImage(product),
    url: httpsUrl(product?.url),
    note,
  }
}

export function rowsForGroup(game, group, products, today, earliest) {
  const setDate = calendarDate(group?.publishedOn)
  if (!setDate || setDate < earliest) return []
  const kept = (products || []).filter((product) => isSealed(product) && keepProduct(product?.name))
  const rows = kept
    .map((product) => rowFrom(game, group, product, setDate, earliest, today, null))
    .filter(Boolean)
  if (kept.length) return rows
  if (group.isSupplemental || /release event|promo/i.test(group.name || '')) return []
  const placeholder = rowFrom(game, group, null, setDate, earliest, today, 'Individual products are not listed yet.')
  return placeholder ? [placeholder] : []
}

function variantBase(name) {
  if (/\[set of \d+\]/i.test(name)) return null
  if (!/tin|blister|deck|collection/i.test(name)) return null
  const base = String(name || '').replace(/\s*\[[^\]]+\]/g, '').replace(/\s+/g, ' ').trim()
  if (!base || base === String(name || '').trim()) return null
  return base
}

export function collapseVariants(rows) {
  const groups = new Map()
  const order = []
  for (const row of rows) {
    const base = variantBase(row.name)
    const key = base ? `${row.game}|${row.releasedOn}|${row.setName}|${base}` : ''
    if (!key) {
      order.push(row)
      continue
    }
    if (!groups.has(key)) {
      groups.set(key, [])
      order.push(key)
    }
    groups.get(key).push(row)
  }
  return order.map((item) => {
    if (typeof item !== 'string') return item
    const list = groups.get(item)
    if (list.length === 1) return list[0]
    const first = list[0]
    return {
      ...first,
      name: variantBase(first.name),
      note: first.note || `${list.length} versions, same date.`,
    }
  })
}

export function sortReleases(rows) {
  return [...rows].sort((a, b) => {
    if (a.status !== b.status) return a.status === 'coming' ? -1 : 1
    const byDate = a.status === 'coming'
      ? a.releasedOn.localeCompare(b.releasedOn)
      : b.releasedOn.localeCompare(a.releasedOn)
    if (byDate) return byDate
    const bySet = a.setName.localeCompare(b.setName)
    if (bySet) return bySet
    const byRank = productRank(a.name) - productRank(b.name)
    if (byRank) return byRank
    return a.name.localeCompare(b.name)
  })
}
