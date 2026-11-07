const CODE_PREFIX = new Set(['OP', 'EB', 'ST', 'PRB', 'DP', 'GC', 'TS', 'PEB'])
const GENERIC = new Set([
  'the', 'and', 'for', 'with', 'from', 'vol', 'volume', 'set', 'pack', 'packs', 'box', 'case',
  'display', 'booster', 'extra', 'bundle', 'deck', 'decks', 'starter', 'collection', 'premium',
  'double', 'sleeved', 'art', 'kit', 'kits', 'event', 'pre', 'rift', 'showdown', 'vault',
  'edition', 'one', 'piece', 'card', 'game', 'tcg', 'sealed', 'english',
])

export function plain(value) {
  return String(value || '').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, 'and').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim()
}

export function norm(value) {
  return plain(value).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

function formatCode(prefix, digits) {
  if (digits.length >= 4) return `${prefix}-${digits}`
  return `${prefix}-${digits.padStart(2, '0')}`
}

export function codesIn(value) {
  const found = []
  const text = plain(value).toUpperCase()
  for (const match of text.matchAll(/\b([A-Z]{2,3})[-\s]?(\d{2,4})\b/g)) {
    if (!CODE_PREFIX.has(match[1])) continue
    found.push(formatCode(match[1], match[2]))
  }
  return [...new Set(found)]
}

export function kindOf(name) {
  const text = norm(name)
  if (/sleeved booster|art bundle/.test(text)) return 'pack'
  if (/sleeve|playmat|binder|deck box/.test(text)) return 'gear'
  if (/pre rift/.test(text)) return 'kit'
  if (/\bvault\b/.test(text)) return 'vault'
  if (/double pack/.test(text)) return 'double'
  if (/showdown|champion deck|starter deck|preconstructed/.test(text)) return 'deck'
  if (/gift collection|premium card collection|card collection/.test(text)) return 'collection'
  if (/booster box|booster display|\bcase\b/.test(text)) return 'box'
  return 'other'
}

function editionFlag(value) {
  const text = norm(value)
  if (/\b(2nd|second)\b/.test(text)) return 2
  if (/\b(1st|first)\b/.test(text)) return 1
  return 0
}

function coreSet(value) {
  return norm(value).replace(/\b(2nd|second|1st|first|edition)\b/g, ' ').replace(/\s+/g, ' ').trim()
}

export function setsMatch(productSet, articleSet) {
  const left = coreSet(productSet)
  const right = coreSet(articleSet)
  if (!left || !right || left !== right) return false
  return editionFlag(productSet) === editionFlag(articleSet)
}

function volumeOf(value) {
  const match = norm(value).match(/\bvol(?:ume)?\s+(\d+)\b/)
  return match ? Number(match[1]) : null
}

function distinctive(value) {
  return norm(value).split(' ').filter((token) => token.length > 2 && !GENERIC.has(token) && !/^\d+$/.test(token))
}

function loose(left, right) {
  if (left === right) return true
  if (left.length >= 5 && right.length >= 5 && (left.startsWith(right) || right.startsWith(left))) return true
  return false
}

function titlesMatch(row, item) {
  const wanted = distinctive(`${row.setName || ''} ${row.abbreviation || ''}`)
  const title = distinctive(item.title)
  if (!wanted.length || !title.length) return false
  const left = volumeOf(`${row.setName || ''} ${row.name || ''}`)
  const right = volumeOf(item.title)
  if (left && right && left !== right) return false
  return wanted.every((token) => title.some((other) => loose(token, other)))
}

function kindFromHeading(text) {
  const heading = plain(text)
  if (/decklist/i.test(heading)) return null
  if (/pre-?\s*rift kit/i.test(heading)) return 'kit'
  if (/^vault\b/i.test(heading)) return 'vault'
  if (/showdown deck/i.test(heading)) return 'deck'
  if (/^booster display\b/i.test(heading) || /^booster box\b/i.test(heading)) return 'box'
  return null
}

function setFromHeading(text) {
  const heading = plain(text)
  const numbered = heading.match(/^set\s+\d+\s*:\s*(.+)$/i)
  if (numbered) return plain(numbered[1])
  const lineup = heading.match(/^(.+?)\s+product line-?up$/i)
  if (lineup) return plain(lineup[1])
  if (/^proving grounds\b/i.test(heading) && heading.length < 80) return heading
  return null
}

function setFromTitle(html) {
  const title = plain(html.match(/<title>([^<]+)/i)?.[1])
  const named = title.match(/^the\s+(.+?)\s+overview\b/i)
  return named ? plain(named[1]) : null
}

function officialKind(title) {
  const text = norm(title)
  if (/double pack/.test(text)) return 'double'
  if (/booster/.test(text)) return 'box'
  if (/starter deck|\bdeck\b/.test(text)) return 'deck'
  if (/collection|playmat|sleeve/.test(text)) return 'collection'
  return 'other'
}

export function parseOnePieceIndex(html) {
  const rows = []
  const seen = new Set()
  for (const block of String(html || '').split('linkListColBox').slice(1)) {
    const title = plain(block.match(/linkListColTitle">([^<]+)/)?.[1])
    const src = block.match(/data-src="([^"]+)"/)?.[1]
    if (!title || !src || /img_thumbnail/i.test(src)) continue
    let url = src
    try { url = new URL(src, 'https://en.onepiece-cardgame.com/').href.split('?')[0] } catch { continue }
    if (!url.startsWith('https://')) continue
    const code = codesIn(title)[0] || null
    const key = `${code || title}|${url}`
    if (seen.has(key)) continue
    seen.add(key)
    rows.push({ title, code, kind: officialKind(title), url })
  }
  return rows
}

export function parseRiftboundArticle(html) {
  const source = String(html || '')
  const shots = []
  const pattern = /<h([1-4])[^>]*>([\s\S]*?)<\/h\1>|<img\b[^>]*src="(https:\/\/cmsassets\.rgpub\.io\/[^"]+)"[^>]*>/gi
  let currentSet = setFromTitle(source)
  let pendingKind = null
  let awaitingSetShot = false
  let match
  while ((match = pattern.exec(source))) {
    if (match[2] != null) {
      const heading = match[2]
      const setName = setFromHeading(heading)
      if (setName) {
        currentSet = setName
        pendingKind = null
        awaitingSetShot = true
        continue
      }
      pendingKind = kindFromHeading(heading)
      if (pendingKind) awaitingSetShot = false
      else awaitingSetShot = false
      continue
    }
    const tag = match[0]
    const width = Number(tag.match(/width="(\d+)"/)?.[1] || 0)
    if (width && width < 1600) continue
    const url = match[3].split('?')[0]
    if (!currentSet || !url.startsWith('https://')) continue
    const kind = pendingKind || (awaitingSetShot ? 'box' : null)
    pendingKind = null
    awaitingSetShot = false
    if (!kind) continue
    if (shots.some((shot) => setsMatch(shot.set, currentSet) && shot.kind === kind)) continue
    shots.push({ set: currentSet, kind, url })
  }
  return shots
}

function pickKind(items, kind) {
  if (!items.length) return null
  if (kind === 'gear') return null
  if (kind === 'double') {
    return items.find((item) => item.kind === 'double')?.url || items.find((item) => item.kind === 'box')?.url || null
  }
  if (kind === 'deck') return items.find((item) => item.kind === 'deck')?.url || null
  if (kind === 'collection') return items.find((item) => item.kind === 'collection')?.url || null
  if (kind === 'vault') return items.find((item) => item.kind === 'vault')?.url || items.find((item) => item.kind === 'box')?.url || null
  if (kind === 'kit') return items.find((item) => item.kind === 'kit')?.url || items.find((item) => item.kind === 'box')?.url || null
  return items.find((item) => item.kind === 'box')?.url || null
}

function onePiecePicture(art, row) {
  const items = art.onepiece || []
  const kind = kindOf(row.name)
  if (kind === 'gear') return null
  const codes = [...codesIn(row.abbreviation), ...codesIn(row.name), ...codesIn(row.setName)]
  const byCode = items.filter((item) => item.code && codes.includes(item.code))
  const coded = pickKind(byCode, kind)
  if (coded) return coded
  const byName = items.filter((item) => titlesMatch(row, item))
  return pickKind(byName, kind)
}

function riftboundPicture(art, row) {
  const kind = kindOf(row.name)
  if (kind === 'gear') return null
  const label = row.setName || row.name
  const shots = (art.riftbound || []).filter((shot) => setsMatch(label, shot.set))
  if (!shots.length) return null
  if (kind === 'deck') return shots.find((shot) => shot.kind === 'deck')?.url || null
  if (kind === 'vault') return shots.find((shot) => shot.kind === 'vault')?.url || shots.find((shot) => shot.kind === 'box')?.url || null
  if (kind === 'kit') return shots.find((shot) => shot.kind === 'kit')?.url || shots.find((shot) => shot.kind === 'box')?.url || null
  return shots.find((shot) => shot.kind === 'box')?.url || null
}

export function findPicture(art, row) {
  if (!art || !row) return null
  const game = row.game || row.game_key
  if (game === 'onepiece') return onePiecePicture(art, row)
  if (game === 'riftbound') return riftboundPicture(art, row)
  return null
}

export function shownImage(art, row) {
  const current = row?.imageUrl || row?.image_url || null
  if (!row?.sealed) return current || null
  return findPicture(art, row) || current || null
}
