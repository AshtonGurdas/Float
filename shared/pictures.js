import { norm } from './art.js'

const SERIES = /^(me|sv|swsh|sm|xy|sw)\d*$/

export function groupPhrase(name) {
  const tokens = norm(name).split(' ').filter(Boolean)
  if (tokens.length > 1 && SERIES.test(tokens[0])) {
    const rest = tokens.slice(1).join(' ')
    if (rest.length >= 4) return rest
  }
  return tokens.join(' ')
}

export function matchGroup(groups, title) {
  const text = norm(title)
  let best = null
  for (const group of groups || []) {
    const phrase = groupPhrase(group.name)
    if (!phrase || phrase.length < 4) continue
    const index = text.indexOf(phrase)
    if (index < 0) continue
    const score = (index + phrase.length) * 1000 + phrase.length
    if (!best || score > best.score) best = { group, score }
  }
  return best?.group || null
}

export function sealedKind(name) {
  const text = norm(name)
  if (/\bcode card\b/.test(text)) return 'code'
  if (/\bdeck box\b/.test(text)) return ''
  if (/\bcase\b/.test(text)) return 'case'
  if (/pokemon center/.test(text) && /elite trainer/.test(text)) return 'pc-etb'
  if (/elite trainer/.test(text)) return 'etb'
  if (/ultra premium/.test(text)) return 'upc'
  if (/build and battle/.test(text)) return 'bnb'
  if (/booster bundle/.test(text)) return 'bundle'
  if (/art bundle/.test(text)) return 'art'
  if (/half booster/.test(text)) return 'half'
  if (/sleeved booster/.test(text)) return 'sleeved'
  if (/booster box|booster display|display box/.test(text)) return 'box'
  if (/\btin\b/.test(text)) return 'tin'
  if (/\bcollection\b/.test(text)) return 'collection'
  if (/\bvault\b/.test(text)) return 'vault'
  if (/\bkit\b/.test(text)) return 'kit'
  if (/\bblister\b/.test(text)) return 'blister'
  if (/\bdecks?\b/.test(text)) return 'deck'
  if (/\bbundle\b/.test(text)) return 'bundle'
  if (/booster pack|\bpack\b/.test(text)) return 'pack'
  return ''
}

function overlap(title, name) {
  const words = new Set(norm(title).split(' '))
  return norm(name).split(' ').filter((token) => token.length > 2 && words.has(token)).length
}

function containedName(products, title) {
  const text = norm(title)
  const kind = sealedKind(title)
  const rows = (products || []).filter((row) => {
    if (row.sealed === false) return false
    const name = norm(row.name)
    if (name.length < 8 || !name.includes(' ') || !text.includes(name)) return false
    if (kind && kind !== 'code') return sealedKind(row.name) === kind
    return true
  })
  rows.sort((left, right) => norm(right.name).length - norm(left.name).length || left.name.length - right.name.length)
  return rows[0] || null
}

export function pickSealed(products, title) {
  const named = containedName(products, title)
  if (named) return named
  const kind = sealedKind(title)
  if (!kind || kind === 'code') return null
  let rows = (products || []).filter((row) => row.sealed !== false && sealedKind(row.name) === kind)
  if (!rows.length) return null
  const variant = (norm(title).match(/\b(day|night)\b/) || [])[1] || ''
  if (variant) {
    const exact = rows.filter((row) => new RegExp(`\\b${variant}\\b`).test(norm(row.name)))
    if (exact.length) rows = exact
  }
  rows.sort((left, right) => overlap(title, right.name) - overlap(title, left.name) || left.name.length - right.name.length)
  return rows[0]
}
