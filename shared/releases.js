import { codesIn } from './art.js'
import { sealedKind } from './pictures.js'

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
  return String(value || '')
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
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

function isoDay(value) {
  const match = String(value || '').match(/^(\d{4}-\d{2}-\d{2})/)
  return match ? match[1] : null
}

// A product added to an older set gets a higher id than the rows that have sat unchanged.
function newlyListedIds(products, earliest) {
  const established = []
  for (const product of products || []) {
    const modified = isoDay(product?.modifiedOn)
    if (modified && modified < earliest && Number.isInteger(product?.productId)) established.push(product.productId)
  }
  if (established.length < 8) return new Set()
  established.sort((left, right) => left - right)
  const cutoff = established[Math.min(established.length - 1, Math.floor(established.length * 0.9))]
  const fresh = new Set()
  for (const product of products || []) {
    const modified = isoDay(product?.modifiedOn)
    if (!modified || modified < earliest || !Number.isInteger(product?.productId) || product.productId <= cutoff) continue
    if (calendarDate(product?.presaleInfo?.releasedOn)) continue
    fresh.add(product.productId)
  }
  return fresh
}

export function rowsForGroup(game, group, products, today, earliest) {
  const setDate = calendarDate(group?.publishedOn)
  const kept = (products || []).filter((product) => isSealed(product) && keepProduct(product?.name))
  const fresh = newlyListedIds(products, earliest)
  const rows = []
  for (const product of kept) {
    const dated = rowFrom(game, group, product, setDate, earliest, today, null)
    if (dated) {
      rows.push(dated)
      continue
    }
    if (!fresh.has(product.productId)) continue
    const listed = rowFrom(game, group, product, isoDay(product.modifiedOn), earliest, today, 'Newly listed. No ship date yet.')
    if (listed) rows.push(listed)
  }
  if (kept.length) return rows
  if (!setDate || setDate < earliest) return []
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

const DISTRIBUTOR_GAMES = [
  { code: '2020', key: 'pokemon', name: 'Pokémon' },
  { code: '2034', key: 'riftbound', name: 'Riftbound' },
  { code: '2045', key: 'onepiece', name: 'One Piece', own: /one piece/i },
]

const DISTRIBUTOR_GEAR = /\b(sleeve|sleeves|playmat|binder|portfolio|toploader|deck box)\b/i
const DISTRIBUTOR_URL = 'https://ca.universaldist.com/pre-orders'
const SET_WORD = new Set([
  'booster', 'display', 'bundle', 'collection', 'premium', 'starter', 'extra', 'japanese',
  'english', 'chinese', 'edition', 'card', 'game', 'tcg', 'box', 'case', 'deck', 'set',
  'the', 'and', 'vol', 'pack', 'packs', 'event', 'kit', 'anniversary',
])

function dayNumber(iso) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '')
  if (!match) return null
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) / 86400000
}

function codeSet(value) {
  return new Set(codesIn(value).map((code) => code.replace('-', '')))
}

function keepDistributor(name) {
  if (!name || DISTRIBUTOR_GEAR.test(name)) return false
  if (keepProduct(name)) return true
  const text = String(name).toLowerCase()
  if (/anniversary/.test(text) || /\bvault\b/.test(text) || /proving grounds/.test(text)) return true
  return /\bbooster\b/.test(text) && !/\bbooster pack\b/.test(text)
}

function distributorTitle(name) {
  let text = String(name || '').replace(/\s*\([^)]*\)\s*$/, '').trim()
  text = text.replace(/^ONE PIECE CG\s+/i, '')
  text = text.replace(/^RIFTBOUND(?::)?\s+LEAGUE OF LEGENDS TCG\s+/i, '')
  text = text.replace(/^POK[EÉ]MON(?:\s+TCG)?\s+/i, '')
  text = text.replace(/\s+/g, ' ').trim()
  if (!text) return plain(name)
  const titled = text.toLowerCase().replace(/\b([a-z])/g, (letter) => letter.toUpperCase())
  return titled.replace(/\b(Op|Eb|St|Dp|Peb)-?(\d+)\b/g, (_, prefix, digit) => {
    const code = prefix.toUpperCase()
    const padded = digit.length >= 4 ? digit : digit.padStart(2, '0')
    return `${code}-${padded}`
  })
}

function distributorGame(product, group) {
  const code = String(product?.categoryCode || group?.category || '')
  const game = DISTRIBUTOR_GAMES.find((item) => item.code === code)
  if (!game) return null
  if (game.own && !game.own.test(product?.productName || '')) return null
  return game
}

export function distributorRows(groups, today, earliest) {
  const rows = []
  for (const group of groups || []) {
    for (const product of group?.products || []) {
      const game = distributorGame(product, group)
      if (!game || !keepDistributor(product.productName)) continue
      const releasedOn = isoDay(product.releaseDate)
      if (!releasedOn || releasedOn < earliest) continue
      const name = distributorTitle(product.productName)
      if (!name) continue
      const code = codesIn(name)[0] || codesIn(product.productName)[0] || null
      const image = product.imageGuid
        ? `https://ca.universaldist.com/api/v1/images/${product.imageGuid}/raw?size=s`
        : null
      rows.push({
        productId: null,
        name,
        game: game.key,
        gameName: game.name,
        setName: name,
        abbreviation: code,
        releasedOn,
        status: releasedOn >= today ? 'coming' : 'out',
        imageUrl: image,
        url: DISTRIBUTOR_URL,
        linkLabel: 'Universal Distribution',
        note: 'Distributor ship date. It can move.',
      })
    }
  }
  return rows
}

function releaseKind(name) {
  const kind = sealedKind(name)
  if (kind) return kind
  const text = String(name || '').toLowerCase()
  if (/\bkit\b/.test(text)) return 'kit'
  if (/\bvault\b/.test(text)) return 'vault'
  return ''
}

function sharesRelease(left, right) {
  if (left.game !== right.game) return false
  const leftDay = dayNumber(left.releasedOn)
  const rightDay = dayNumber(right.releasedOn)
  if (leftDay == null || rightDay == null || Math.abs(leftDay - rightDay) > 21) return false
  const leftCodes = codeSet(`${left.name} ${left.abbreviation || ''} ${left.setName || ''}`)
  const rightCodes = codeSet(`${right.name} ${right.abbreviation || ''}`)
  for (const code of rightCodes) {
    if (leftCodes.has(code)) return true
  }
  const leftKind = releaseKind(left.name)
  const rightKind = releaseKind(right.name)
  if (!leftKind || leftKind !== rightKind) return false
  const words = String(right.name || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').split(' ').filter((word) => {
    return word.length >= 4 && !SET_WORD.has(word)
  })
  const hay = `${left.name} ${left.setName || ''}`.toLowerCase()
  return words.some((word) => hay.includes(word))
}

export function mergeReleases(primary, extra) {
  const rows = [...(primary || [])]
  for (const row of extra || []) {
    if (rows.some((existing) => sharesRelease(existing, row))) continue
    rows.push(row)
  }
  return rows
}

const MONTHS = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
}

function isoDate(year, month, day) {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

// "April 30, 2027" is exact. "Mid November 2026" is an estimate anchored on a day in that window.
export function shipDate(phrase) {
  const text = plain(phrase)
  const exact = text.match(/\b([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})\b/)
  if (exact && MONTHS[exact[1].toLowerCase()]) {
    const day = Number(exact[2])
    const month = MONTHS[exact[1].toLowerCase()]
    if (day >= 1 && day <= 31) return { iso: isoDate(Number(exact[3]), month, day), label: text }
  }
  const fuzzy = text.match(/\b(?:(early|mid|late)(?:\s+to\s+(early|mid|late))?\s+)?(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{4})\b/i)
  if (!fuzzy || !MONTHS[fuzzy[3].toLowerCase()]) return null
  const start = (fuzzy[1] || '').toLowerCase()
  const end = (fuzzy[2] || '').toLowerCase()
  const span = `${start} ${end}`.trim()
  let day = 1
  if (span === 'mid late') day = 20
  else if (span === 'early mid') day = 10
  else if (start === 'early') day = 5
  else if (start === 'mid') day = 15
  else if (start === 'late') day = 25
  return { iso: isoDate(Number(fuzzy[4]), MONTHS[fuzzy[3].toLowerCase()], day), label: text }
}

function releaseRow(fields, today) {
  return {
    productId: null,
    name: fields.name,
    game: fields.game,
    gameName: fields.gameName,
    setName: fields.setName,
    abbreviation: fields.abbreviation || null,
    releasedOn: fields.releasedOn,
    status: fields.releasedOn >= today ? 'coming' : 'out',
    imageUrl: fields.imageUrl || null,
    url: fields.url || null,
    linkLabel: fields.linkLabel || null,
    note: fields.note || null,
  }
}

function riftboundProducts(setName, item) {
  const text = plain(item)
  const lower = text.toLowerCase()
  if (/booster packs?\s*(&|and)\s*displays?/.test(lower) || /^booster displays?$/.test(lower)) return [`${setName} Booster Display`]
  if (/^vault bundle$/.test(lower)) return [`${setName} Vault Bundle`]
  if (/pre-?\s*rift kits?/.test(lower)) return [`${setName} Pre-Rift Kit`]
  if (/showdown decks?/.test(lower)) return [`${setName} Showdown Decks`]
  const decks = text.match(/champion decks?(?:\s*:\s*|\s+for\s+)(.+)$/i)
  if (!decks) return []
  const people = decks[1].split(/\s*(?:,|&|\band\b)\s*/i).map((name) => name.replace(/^\d+\s*/, '').trim()).filter((name) => {
    return name && /[a-z]/i.test(name) && name.length < 32
  })
  if (people.length === 1) return [`${setName} Champion Deck: ${people[0]}`]
  if (people.length > 1) {
    const last = people[people.length - 1]
    return [`${setName} Champion Decks: ${people.slice(0, -1).join(', ')} and ${last}`]
  }
  return [`${setName} Champion Decks`]
}

export function riftboundAnnouncementRows(html, pageUrl, today, earliest) {
  const rows = []
  for (const part of String(html || '').split(/<h2[^>]*>/i).slice(1)) {
    const heading = plain(part.split(/<\/h2>/i)[0])
    const setMatch = heading.match(/^set\s+\d+\s*:\s*(.+)$/i)
    if (!setMatch) continue
    const setName = plain(setMatch[1])
    if (!setName) continue
    const found = plain(part).match(/\bRelease\s*:\s*([A-Za-z]+\s+\d{1,2},\s*\d{4})/i)
    const release = shipDate(found?.[1] || '')
    if (!release || release.iso < earliest) continue
    const code = plain(part).match(/3-Letter Code\s*:?\s*([A-Z0-9]{2,5})\b/i)?.[1] || null
    const list = (part.split(/products coming in/i)[1] || '').split(/<\/ul>/i)[0]
    const names = []
    for (const item of list.matchAll(/<li>([\s\S]*?)<\/li>/gi)) names.push(...riftboundProducts(setName, item[1]))
    const products = names.length ? names : [setName]
    const note = names.length ? 'Announced by Riot.' : 'Announced by Riot. Individual products are not listed yet.'
    for (const name of products) {
      rows.push(releaseRow({
        name,
        game: 'riftbound',
        gameName: 'Riftbound',
        setName,
        abbreviation: code,
        releasedOn: release.iso,
        url: pageUrl,
        linkLabel: 'Riot',
        note,
      }, today))
    }
  }
  return rows
}

function readable(value) {
  const small = new Set(['of', 'and', 'the', 'for'])
  return plain(value).split(' ').map((word, index) => {
    const letters = word.replace(/[^A-Za-z]/g, '')
    if (!letters || letters !== letters.toUpperCase() || letters.length < 2) return word
    const lower = letters.toLowerCase()
    const cased = index > 0 && small.has(lower) ? lower : lower.charAt(0).toUpperCase() + lower.slice(1)
    return word.replace(letters, cased)
  }).join(' ')
}

function onePieceName(title) {
  const code = codesIn(title)[0] || null
  const bare = plain(title).replace(/\s*\[[^\]]+\]\s*/g, ' ').replace(/\s+/g, ' ').trim()
  if (/\b(sleeve|sleeves|playmat|binder|portfolio|toploader|deck box)\b/i.test(bare)) return null
  const pack = /\bbooster pack\b|\bextra booster\b/i.test(bare) && !/\bbox\b|\bdisplay\b|\bcase\b/i.test(bare)
  if (pack) {
    const setName = readable(bare)
      .replace(/^(Premium\s+)?(Extra\s+)?Booster Pack\s*[-–—:]+\s*/i, '')
      .replace(/^(Premium\s+)?Extra Booster\s*[-–—:]+\s*/i, '')
      .replace(/^[-–—\s]+|[-–—\s]+$/g, '')
      .trim()
    if (!setName) return null
    return { name: `${setName} Booster`, setName, code }
  }
  if (!keepProduct(bare) && !/anniversary/i.test(bare)) return null
  const name = readable(bare)
  return { name, setName: name, code }
}

export function onePieceProductRows(html, today, earliest) {
  const rows = []
  const seen = new Set()
  const pattern = /<a\b([^>]*\s)class="linkListColItem"([^>]*)>([\s\S]*?)<\/a>/gi
  for (const match of String(html || '').matchAll(pattern)) {
    const block = match[3]
    const title = plain(block.match(/linkListColTitle">([^<]+)/)?.[1])
    const releasedOn = block.match(/datetime="(\d{4}-\d{2}-\d{2})"/)?.[1]
    if (!title || !releasedOn || releasedOn < earliest) continue
    const shaped = onePieceName(title)
    if (!shaped) continue
    const key = `${shaped.name}|${releasedOn}`
    if (seen.has(key)) continue
    seen.add(key)
    const href = `${match[1]} ${match[2]}`.match(/href="([^"]+)"/)?.[1]
    let url = 'https://en.onepiece-cardgame.com/products/'
    if (href) {
      try { url = new URL(href, 'https://en.onepiece-cardgame.com/').href } catch { /* keep the index */ }
    }
    const src = block.match(/data-src="([^"]+)"/)?.[1]
    let imageUrl = null
    if (src && !/img_thumbnail|img_noimage/i.test(src)) {
      try {
        const picture = new URL(src, 'https://en.onepiece-cardgame.com/').href.split('?')[0]
        if (picture.startsWith('https://')) imageUrl = picture
      } catch { /* letter fallback */ }
    }
    rows.push(releaseRow({
      name: shaped.name,
      game: 'onepiece',
      gameName: 'One Piece',
      setName: shaped.setName,
      abbreviation: shaped.code,
      releasedOn,
      imageUrl,
      url,
      linkLabel: 'One Piece',
      note: 'Official release date.',
    }, today))
  }
  return rows
}

export function pokemonArticleRows(html, pageUrl, today, earliest) {
  const rows = []
  const seen = new Set()
  for (const part of String(html || '').split(/<h2[^>]*>/i).slice(1)) {
    const heading = plain(part.split(/<\/h2>/i)[0])
    if (!/pok[eé]mon tcg/i.test(heading)) continue
    const found = plain(part).match(/\bAvailable\s*:?\s*([A-Za-z]+\s+\d{1,2},\s*\d{4})/i)
    const available = shipDate(found?.[1] || '')
    if (!available || available.iso < earliest) continue
    const name = heading.replace(/^Pok[eé]mon TCG:\s*/i, '').trim()
    if (!keepProduct(name)) continue
    const key = `${name}|${available.iso}`
    if (seen.has(key)) continue
    seen.add(key)
    const center = /pok[eé]mon center/i.test(name)
    const image = part.match(/src="(https:\/\/[^"]+)"/i)?.[1]?.split('?')[0] || null
    rows.push({
      channel: center ? 'center' : 'catalog',
      ...releaseRow({
        name,
        game: 'pokemon',
        gameName: 'Pokémon',
        setName: center ? 'Pokémon Center' : name,
        releasedOn: available.iso,
        imageUrl: image && image.startsWith('https://') ? image : null,
        url: pageUrl,
        linkLabel: center ? 'Pokémon Center' : 'Pokémon',
        note: center ? 'Pokémon Center product.' : 'Official product date.',
      }, today),
    })
  }
  return rows
}

const CENTER_URL = 'https://support.pokemoncenter.com/hc/en-us/articles/4407702295572-Estimated-Preorder-Release-Dates'

export function pokemonCenterRows(html, today, earliest) {
  const rows = []
  const seen = new Set()
  for (const tableRow of String(html || '').matchAll(/<tr[\s\S]*?<\/tr>/gi)) {
    const cells = [...tableRow[0].matchAll(/<td[\s\S]*?<\/td>/gi)].map((cell) => cell[0])
    if (cells.length < 3) continue
    const items = [...cells[0].matchAll(/<li[\s\S]*?<\/li>/gi)].map((item) => plain(item[0]))
    const names = items.length ? items : [plain(cells[0])].filter(Boolean)
    const region = plain(cells[1])
    const when = plain(cells[2])
    const ship = shipDate(when)
    if (!ship || ship.iso < earliest) continue
    for (const raw of names) {
      if (!/pok[eé]mon tcg/i.test(raw)) continue
      if (/\b(sleeve|sleeves|playmat|binder|portfolio|toploader|deck box|plush)\b/i.test(raw)) continue
      const name = raw.replace(/^Pok[eé]mon TCG:\s*/i, '').trim()
      if (!name) continue
      const key = `${name}|${ship.iso}|${when}`
      if (seen.has(key)) continue
      seen.add(key)
      rows.push({
        channel: 'center',
        ...releaseRow({
          name,
          game: 'pokemon',
          gameName: 'Pokémon',
          setName: 'Pokémon Center',
          releasedOn: ship.iso,
          url: CENTER_URL,
          linkLabel: 'Pokémon Center',
          note: `Pokémon Center preorder. Estimated ship: ${when}.${region ? ` ${region}.` : ''} It can move.`,
        }, today),
      })
    }
  }
  return rows
}

export function catalogRows(rows) {
  return (rows || []).filter((row) => row.channel !== 'center').map(({ channel, ...row }) => row)
}

export function centerRows(rows) {
  return (rows || []).filter((row) => row.channel === 'center').map(({ channel, ...row }) => row)
}

export function addCenterRows(rows, extra) {
  const next = [...(rows || [])]
  for (const row of extra || []) {
    const same = next.some((existing) => {
      return existing.name === row.name && existing.releasedOn === row.releasedOn && existing.note === row.note
    })
    if (!same) next.push(row)
  }
  return next
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
