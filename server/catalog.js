import { gameByKey } from '../shared/games.js'
import { asNumber, sleep, tcg, utcDay } from './tcg.js'

const STOP = new Set(['the', 'of', 'a', 'an', 'and', 'for', 'set', 'tcg', 'card', 'cards', 'from', 'with'])
const CONDITIONS = new Set(['nm', 'lp', 'mp', 'hp', 'dmg', 'near', 'mint', 'played', 'unopened'])
const FRESH_MS = 20 * 60 * 60 * 1000
const GROUPS_FRESH_MS = 24 * 60 * 60 * 1000
const SMALL_GAME_SETS = 45

function httpError(message, status) {
  const error = new Error(message)
  error.status = status
  return error
}

export function tokensOf(query) {
  return String(query || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter((token) => token.length >= 2 && !STOP.has(token))
}

function plain(value) {
  if (!value) return null
  const text = String(value).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
  return text || null
}

function extended(product, ...names) {
  const wanted = new Set(names.map((name) => name.toLowerCase()))
  const hit = (product.extendedData || []).find((item) => wanted.has(String(item.name || '').toLowerCase()))
  return plain(hit?.value)
}

function isSealed(product) {
  const number = extended(product, 'Number', 'Card Number')
  const rarity = extended(product, 'Rarity')
  return !number && !rarity
}

function searchText(product, setName, number, rarity, subtypes = []) {
  return [product.name, product.cleanName, setName, number, rarity, ...subtypes].filter(Boolean).join(' ').toLowerCase()
}

async function chunkUpsert(client, table, rows, onConflict, size = 400) {
  for (let index = 0; index < rows.length; index += size) {
    const part = rows.slice(index, index + size)
    if (!part.length) continue
    const { error } = await client.from(table).upsert(part, { onConflict })
    if (error) throw new Error(error.message)
  }
}

function shapePrice(row) {
  return {
    subtype: row.subtype,
    market: asNumber(row.market_price),
    low: asNumber(row.low_price),
    mid: asNumber(row.mid_price),
    high: asNumber(row.high_price),
    updatedOn: row.updated_on,
  }
}

function shapeProduct(row, prices) {
  return {
    productId: row.product_id,
    categoryId: row.category_id,
    groupId: row.group_id,
    game: row.game_key,
    name: row.name,
    setName: row.set_name,
    imageUrl: row.image_url,
    url: row.tcg_url,
    number: row.number,
    rarity: row.rarity,
    sealed: row.sealed,
    prices: (prices || []).map(shapePrice).sort((a, b) => (b.market ?? -1) - (a.market ?? -1)),
  }
}

async function pricesFor(client, productIds) {
  const map = new Map()
  for (let index = 0; index < productIds.length; index += 80) {
    const part = productIds.slice(index, index + 80)
    if (!part.length) continue
    const { data, error } = await client.from('catalog_prices').select('*').in('product_id', part)
    if (error) throw new Error(error.message)
    for (const row of data || []) {
      const list = map.get(row.product_id) || []
      list.push(row)
      map.set(row.product_id, list)
    }
  }
  return map
}

export async function ensureGroups(client, game) {
  const { data: fresh, error: freshError } = await client
    .from('catalog_groups')
    .select('fetched_at')
    .eq('game_key', game.key)
    .order('fetched_at', { ascending: false })
    .limit(1)
  if (freshError) throw new Error(freshError.message)
  const fetchedAt = fresh?.[0]?.fetched_at
  const recent = fetchedAt && Date.now() - new Date(fetchedAt).getTime() < GROUPS_FRESH_MS
  if (!recent) {
    const payload = await tcg(`/${game.categoryId}/groups`)
    const now = new Date().toISOString()
    const rows = (payload.results || []).map((group) => ({
      category_id: game.categoryId,
      group_id: group.groupId,
      game_key: game.key,
      name: group.name,
      abbreviation: group.abbreviation || null,
      published_on: group.publishedOn || null,
      is_supplemental: Boolean(group.isSupplemental),
      fetched_at: now,
    }))
    await chunkUpsert(client, 'catalog_groups', rows, 'category_id,group_id', 500)
  }
  const { data, error } = await client.from('catalog_groups').select('*').eq('game_key', game.key)
  if (error) throw new Error(error.message)
  return data || []
}

async function groupIsFresh(client, categoryId, groupId) {
  const { data, error } = await client
    .from('catalog_products')
    .select('updated_at')
    .eq('category_id', categoryId)
    .eq('group_id', groupId)
    .order('updated_at', { ascending: false })
    .limit(1)
  if (error) throw new Error(error.message)
  if (!data?.length) return false
  return Date.now() - new Date(data[0].updated_at).getTime() < FRESH_MS
}

function bestGroup(groups, parts) {
  let best = null
  for (const group of groups) {
    const name = group.name.toLowerCase()
    const abbreviation = (group.abbreviation || '').toLowerCase()
    let score = 0
    for (const token of parts) {
      if (abbreviation && abbreviation === token) score += 5
      else if (token.length >= 3 && name.includes(token)) score += token.length >= 5 ? 3 : 2
    }
    if (score < 2) continue
    const published = group.published_on || ''
    if (!best || score > best.score || (score === best.score && published > best.published)) {
      best = { group, score, published }
    }
  }
  return best?.group || null
}

async function watchedKeys(client, productIds) {
  const keys = new Set()
  for (let index = 0; index < productIds.length; index += 80) {
    const part = productIds.slice(index, index + 80)
    if (!part.length) continue
    const { data, error } = await client.from('watchlist').select('product_id, subtype').in('product_id', part)
    if (error) throw new Error(error.message)
    for (const row of data || []) keys.add(`${row.product_id}:${row.subtype}`)
  }
  return keys
}

export async function ingestGroup(client, game, group, extraKeys = new Set()) {
  const [productsPayload, pricesPayload] = await Promise.all([
    tcg(`/${game.categoryId}/${group.group_id}/products`),
    tcg(`/${game.categoryId}/${group.group_id}/prices`),
  ])
  const now = new Date().toISOString()
  const today = utcDay()
  const products = new Map()
  const subtypesByProduct = new Map()
  for (const price of pricesPayload.results || []) {
    if (!price.subTypeName) continue
    const list = subtypesByProduct.get(price.productId) || []
    list.push(price.subTypeName)
    subtypesByProduct.set(price.productId, list)
  }
  for (const product of productsPayload.results || []) {
    const number = extended(product, 'Number', 'Card Number')
    const rarity = extended(product, 'Rarity')
    const sealed = isSealed(product)
    const subtypes = subtypesByProduct.get(product.productId) || []
    products.set(product.productId, {
      product_id: product.productId,
      category_id: game.categoryId,
      group_id: group.group_id,
      game_key: game.key,
      name: product.name,
      set_name: group.name,
      image_url: product.imageUrl || null,
      tcg_url: product.url || null,
      number,
      rarity,
      sealed,
      search_text: searchText(product, group.name, number, rarity, subtypes),
      updated_at: now,
    })
  }
  await chunkUpsert(client, 'catalog_products', [...products.values()], 'product_id')

  const productIds = [...products.keys()]
  const historyKeys = new Set([...(await watchedKeys(client, productIds)), ...extraKeys])
  const priceRows = []
  const historyRows = []
  const seen = new Set()
  for (const price of pricesPayload.results || []) {
    if (!products.has(price.productId)) continue
    const subtype = price.subTypeName || 'Normal'
    const key = `${price.productId}:${subtype}`
    if (seen.has(key)) continue
    seen.add(key)
    priceRows.push({
      product_id: price.productId,
      subtype,
      market_price: asNumber(price.marketPrice),
      low_price: asNumber(price.lowPrice),
      mid_price: asNumber(price.midPrice),
      high_price: asNumber(price.highPrice),
      direct_low: asNumber(price.directLowPrice),
      updated_on: today,
    })
    if (historyKeys.has(key) && asNumber(price.marketPrice) != null) {
      historyRows.push({
        product_id: price.productId,
        subtype,
        captured_on: today,
        market_price: asNumber(price.marketPrice),
        low_price: asNumber(price.lowPrice),
        mid_price: asNumber(price.midPrice),
      })
    }
  }
  await chunkUpsert(client, 'catalog_prices', priceRows, 'product_id,subtype')
  await chunkUpsert(client, 'price_history', historyRows, 'product_id,subtype,captured_on')
  return products.size
}

async function ingestIfStale(client, game, group, extraKeys) {
  if (await groupIsFresh(client, game.categoryId, group.group_id)) return false
  await ingestGroup(client, game, group, extraKeys)
  return true
}

function requireGame(key) {
  const game = gameByKey(key)
  if (!game) throw httpError('Pick a game from the list.', 400)
  return game
}

async function searchRows(client, game, parts, filter) {
  const strong = parts.filter((token) => token.length >= 3)
  const used = strong.length ? strong : parts
  const { data, error } = await client.rpc('search_catalog', {
    p_game: game.key,
    p_tokens: used,
    p_sealed: filter === 'sealed' ? true : filter === 'card' ? false : null,
    p_limit: 200,
  })
  if (error) throw new Error(error.message)
  return data || []
}

async function indexedGroupIds(client, game) {
  const ids = new Set()
  let from = 0
  while (true) {
    const { data, error } = await client
      .from('catalog_products')
      .select('group_id')
      .eq('game_key', game.key)
      .range(from, from + 999)
    if (error) throw new Error(error.message)
    for (const row of data || []) ids.add(row.group_id)
    if (!data || data.length < 1000) break
    from += 1000
  }
  return ids
}

async function indexMoreSets(client, game, groups) {
  const have = await indexedGroupIds(client, game)
  const missing = groups
    .filter((group) => !have.has(group.group_id))
    .sort((a, b) => (b.published_on || '').localeCompare(a.published_on || ''))
  const batch = missing.slice(0, groups.length <= SMALL_GAME_SETS ? 8 : 4)
  for (const group of batch) {
    try {
      await ingestIfStale(client, game, group)
    } catch (error) {
      console.error(`Could not load ${group.name}:`, error instanceof Error ? error.message : error)
    }
    await sleep(100)
  }
  const remainingSets = Math.max(0, missing.length - batch.length)
  return {
    remainingSets,
    scanned: batch.length,
    shouldContinue: batch.length > 0 && remainingSets > 0 && groups.length <= SMALL_GAME_SETS,
  }
}

function scoreRow(row, parts) {
  const name = row.name.toLowerCase()
  const setName = (row.set_name || '').toLowerCase()
  let score = 0
  for (const token of parts) {
    if (name.includes(token)) score += 3
    else if (setName.includes(token)) score += 2
    else if ((row.number || '').toLowerCase().includes(token)) score += 2
  }
  if (parts[0] && name.startsWith(parts[0])) score += 2
  const wantsBox = parts.includes('box') && !parts.includes('bundle')
  const wantsCase = parts.includes('case')
  if (wantsBox && name.includes('booster box')) score += 12
  if (wantsBox && name.includes('bundle')) score -= 6
  if (wantsCase && /\bcase\b/.test(name)) score += 12
  if ((parts.includes('etb') || (parts.includes('elite') && parts.includes('trainer'))) && name.includes('elite trainer')) score += 12
  return score
}

function sealedRank(name) {
  const text = name.toLowerCase()
  if (text.includes('case') && text.includes('booster')) return 0
  if (text.includes('booster box')) return 1
  if (text.includes('elite trainer')) return 2
  if (text.includes('bundle') || text.includes('booster pack')) return 3
  return 5
}

export async function search(client, body) {
  const game = requireGame(body.game)
  const filter = body.filter === 'sealed' || body.filter === 'card' ? body.filter : 'all'
  const parts = tokensOf(body.q)
  const groups = await ensureGroups(client, game)
  const match = parts.length ? bestGroup(groups, parts) : null
  let loadedSet = null
  if (match) {
    const loaded = await ingestIfStale(client, game, match)
    if (loaded || match) loadedSet = match.name
  }
  const progress = parts.length && groups.length <= SMALL_GAME_SETS
    ? await indexMoreSets(client, game, groups)
    : { remainingSets: 0, scanned: 0, shouldContinue: false }
  const rows = parts.length ? await searchRows(client, game, parts, filter) : []
  const priceMap = await pricesFor(client, rows.map((row) => row.product_id))
  const wantsSealed = parts.some((token) => ['box', 'case', 'pack', 'etb', 'tin', 'bundle', 'sealed'].includes(token))
  const results = rows
    .map((row) => ({ row, score: scoreRow(row, parts) }))
    .sort((a, b) => {
      if (wantsSealed && a.row.sealed !== b.row.sealed) return a.row.sealed ? -1 : 1
      if (b.score !== a.score) return b.score - a.score
      if (a.row.sealed !== b.row.sealed && match && parts.every((token) => match.name.toLowerCase().includes(token) || token.length < 4)) {
        return sealedRank(a.row.name) - sealedRank(b.row.name)
      }
      return a.row.name.localeCompare(b.row.name)
    })
    .slice(0, 200)
    .map(({ row }) => shapeProduct(row, priceMap.get(row.product_id)))

  const sets = results.length < 5
    ? groups
        .filter((group) => !group.is_supplemental)
        .sort((a, b) => (b.published_on || '').localeCompare(a.published_on || ''))
        .slice(0, 12)
        .map((group) => ({
          groupId: group.group_id,
          categoryId: group.category_id,
          name: group.name,
          abbreviation: group.abbreviation,
          publishedOn: group.published_on,
        }))
    : []

  let note = null
  if (progress.shouldContinue) note = 'Checking the rest of the sets for that word…'
  else if (results.length === 0 && parts.length) note = 'Nothing matched yet. Open the set, or search the set name and the card together.'
  else if (!progress.shouldContinue && progress.remainingSets > 0 && results.length > 0) {
    note = 'Showing matches from the sets loaded so far. Add the set name to pull in an older set.'
  }

  return {
    results,
    sets,
    loadedSet,
    note,
    remainingSets: progress.remainingSets,
    shouldContinue: progress.shouldContinue,
  }
}

const pictureGroups = new Map()

async function groupsForMatching(client) {
  const cached = pictureGroups.get('all')
  if (cached && Date.now() - cached.at < 10 * 60 * 1000) return cached.rows
  const { data, error } = await client.from('catalog_groups').select('game_key, name, abbreviation, group_id, category_id, published_on, is_supplemental')
  if (error) throw new Error(error.message)
  const rows = data || []
  pictureGroups.set('all', { at: Date.now(), rows })
  return rows
}

function nameTokens(parts, groups) {
  const setTokens = new Set()
  for (const group of groups) {
    for (const token of tokensOf(`${group.name || ''} ${group.abbreviation || ''}`)) setTokens.add(token)
  }
  return parts.filter((token) => token.length >= 4 && !CONDITIONS.has(token) && !setTokens.has(token))
}

export async function picturesFor(client, body) {
  const items = (Array.isArray(body.items) ? body.items : []).slice(0, 40).map((item) => ({
    id: String(item.id || ''),
    title: String(item.title || ''),
    detail: String(item.detail || ''),
  })).filter((item) => item.id && item.title)
  if (!items.length) return { items: [] }

  const groups = await groupsForMatching(client)
  const blob = items.map((item) => `${item.title} ${item.detail}`).join(' ')
  const mentioned = new Set()
  for (const token of tokensOf(blob)) {
    for (const group of groups) {
      const name = group.name.toLowerCase()
      const abbreviation = (group.abbreviation || '').toLowerCase()
      if ((token.length >= 4 && name.includes(token)) || abbreviation === token) mentioned.add(group.game_key)
    }
  }
  for (const gameKey of mentioned) {
    const game = gameByKey(gameKey)
    const gameGroups = groups.filter((group) => group.game_key === gameKey)
    if (!game || gameGroups.length > SMALL_GAME_SETS) continue
    let guard = 0
    let progress = { shouldContinue: true }
    while (progress.shouldContinue && guard < 4) {
      progress = await indexMoreSets(client, game, gameGroups)
      guard += 1
    }
  }

  const pictures = []
  for (const item of items) {
    const parts = tokensOf(`${item.title} ${item.detail}`).filter((token) => !CONDITIONS.has(token))
    const needed = nameTokens(parts, groups)
    if (!needed.length) continue
    let query = client.from('catalog_products').select('name, set_name, image_url, number, search_text').limit(25)
    for (const token of needed.slice(0, 4)) query = query.ilike('search_text', `%${token}%`)
    const { data, error } = await query
    if (error) throw new Error(error.message)
    let best = null
    for (const row of data || []) {
      const name = row.name.toLowerCase()
      if (!needed.every((token) => name.includes(token))) continue
      if (!row.image_url) continue
      let score = needed.reduce((sum, token) => sum + token.length, 0)
      const setName = (row.set_name || '').toLowerCase()
      for (const token of parts) {
        if (setName.includes(token)) score += 3
        if (name.includes(token)) score += 1
      }
      if (!best || score > best.score) best = { row, score }
    }
    if (!best) continue
    pictures.push({
      id: item.id,
      imageUrl: best.row.image_url,
      name: best.row.name,
      setName: best.row.set_name,
    })
  }
  return { items: pictures }
}

export async function listSets(client, gameKey) {
  const game = requireGame(gameKey)
  const groups = await ensureGroups(client, game)
  return {
    sets: groups
      .slice()
      .sort((a, b) => (b.published_on || '').localeCompare(a.published_on || ''))
      .slice(0, 80)
      .map((group) => ({
        groupId: group.group_id,
        name: group.name,
        abbreviation: group.abbreviation,
        publishedOn: group.published_on,
        supplemental: group.is_supplemental,
      })),
  }
}

export async function ingestOne(client, body) {
  const game = requireGame(body.game)
  const groupId = Number(body.groupId)
  if (!Number.isInteger(groupId) || groupId <= 0) throw httpError('That set was not found.', 400)
  const groups = await ensureGroups(client, game)
  const group = groups.find((item) => item.group_id === groupId)
  if (!group) throw httpError('That set was not found.', 404)
  await ingestIfStale(client, game, group)
  const { data, error } = await client
    .from('catalog_products')
    .select('*')
    .eq('category_id', game.categoryId)
    .eq('group_id', groupId)
    .limit(80)
  if (error) throw new Error(error.message)
  return { count: data?.length || 0, name: group.name }
}

function newestSets(groups, count) {
  return groups
    .filter((group) => !group.is_supplemental)
    .sort((a, b) => (b.published_on || '').localeCompare(a.published_on || ''))
    .slice(0, count)
}

export async function latestSealed(client, gameKey) {
  const game = requireGame(gameKey)
  const groups = await ensureGroups(client, game)
  const sets = newestSets(groups, 2)
  for (const group of sets) {
    await ingestIfStale(client, game, group)
    await sleep(120)
  }
  if (!sets.length) return { results: [], sets: [] }
  const { data, error } = await client
    .from('catalog_products')
    .select('*')
    .eq('game_key', game.key)
    .eq('sealed', true)
    .in('group_id', sets.map((group) => group.group_id))
    .limit(80)
  if (error) throw new Error(error.message)
  const rows = data || []
  const priceMap = await pricesFor(client, rows.map((row) => row.product_id))
  const results = rows
    .sort((a, b) => sealedRank(a.name) - sealedRank(b.name) || a.name.localeCompare(b.name))
    .slice(0, 24)
    .map((row) => shapeProduct(row, priceMap.get(row.product_id)))
  return {
    results,
    sets: sets.map((group) => ({ groupId: group.group_id, name: group.name })),
  }
}

async function refreshGroupPrices(client, categoryId, groupId, historyKeys) {
  const payload = await tcg(`/${categoryId}/${groupId}/prices`)
  const today = utcDay()
  const { data: known, error } = await client
    .from('catalog_products')
    .select('product_id')
    .eq('category_id', categoryId)
    .eq('group_id', groupId)
  if (error) throw new Error(error.message)
  const ids = new Set((known || []).map((row) => row.product_id))
  const priceRows = []
  const historyRows = []
  const seen = new Set()
  for (const price of payload.results || []) {
    if (!ids.has(price.productId)) continue
    const subtype = price.subTypeName || 'Normal'
    const key = `${price.productId}:${subtype}`
    if (seen.has(key)) continue
    seen.add(key)
    const market = asNumber(price.marketPrice)
    priceRows.push({
      product_id: price.productId,
      subtype,
      market_price: market,
      low_price: asNumber(price.lowPrice),
      mid_price: asNumber(price.midPrice),
      high_price: asNumber(price.highPrice),
      direct_low: asNumber(price.directLowPrice),
      updated_on: today,
    })
    if (historyKeys.has(key) && market != null) {
      historyRows.push({
        product_id: price.productId,
        subtype,
        captured_on: today,
        market_price: market,
        low_price: asNumber(price.lowPrice),
        mid_price: asNumber(price.midPrice),
      })
    }
  }
  await chunkUpsert(client, 'catalog_prices', priceRows, 'product_id,subtype')
  await chunkUpsert(client, 'price_history', historyRows, 'product_id,subtype,captured_on')
}

async function loadProducts(client, productIds) {
  const rows = []
  for (let index = 0; index < productIds.length; index += 80) {
    const part = productIds.slice(index, index + 80)
    if (!part.length) continue
    const { data, error } = await client.from('catalog_products').select('*').in('product_id', part)
    if (error) throw new Error(error.message)
    rows.push(...(data || []))
  }
  return rows
}

export async function refreshPrices(client, { userId, items, allUsers }) {
  let pairs = []
  if (Array.isArray(items) && items.length) {
    pairs = items
      .map((item) => ({ productId: Number(item.productId), subtype: String(item.subtype || 'Normal') }))
      .filter((item) => Number.isInteger(item.productId) && item.productId > 0)
      .slice(0, 80)
  } else {
    let query = client.from('watchlist').select('product_id, subtype')
    if (!allUsers) query = query.eq('user_id', userId)
    const { data, error } = await query
    if (error) throw new Error(error.message)
    pairs = (data || []).map((row) => ({ productId: row.product_id, subtype: row.subtype }))
  }
  if (!pairs.length) return { updated: 0, groups: 0 }

  const products = await loadProducts(client, [...new Set(pairs.map((pair) => pair.productId))])
  const byId = new Map(products.map((product) => [product.product_id, product]))
  const groups = new Map()
  const historyKeys = new Set(pairs.map((pair) => `${pair.productId}:${pair.subtype}`))
  for (const pair of pairs) {
    const product = byId.get(pair.productId)
    if (!product) continue
    // A direct lookup snapshots every printing so the chart can switch.
    if (Array.isArray(items) && items.length) {
      const prices = (await pricesFor(client, [pair.productId])).get(pair.productId) || []
      for (const price of prices) historyKeys.add(`${pair.productId}:${price.subtype}`)
      historyKeys.add(`${pair.productId}:${pair.subtype}`)
    }
    const key = `${product.category_id}:${product.group_id}`
    if (!groups.has(key)) groups.set(key, { categoryId: product.category_id, groupId: product.group_id })
  }

  let updated = 0
  const limited = [...groups.values()].slice(0, 30)
  for (const group of limited) {
    await refreshGroupPrices(client, group.categoryId, group.groupId, historyKeys)
    updated += 1
    await sleep(120)
  }
  return { updated, groups: limited.length, remaining: Math.max(0, groups.size - limited.length) }
}

function historyFor(rows, subtype) {
  return (rows || [])
    .filter((row) => row.subtype === subtype && asNumber(row.market_price) != null)
    .map((row) => ({ date: row.captured_on, market: asNumber(row.market_price) }))
    .sort((a, b) => a.date.localeCompare(b.date))
}

function previousClose(points, today) {
  const prior = points.filter((point) => point.date < today)
  if (!prior.length) return null
  return prior[prior.length - 1].market
}

async function snapshotCached(client, pairs, priceMap) {
  const today = utcDay()
  const rows = []
  const seen = new Set()
  for (const pair of pairs) {
    const prices = priceMap.get(pair.productId) || []
    const price = prices.find((item) => item.subtype === pair.subtype) || prices.find((item) => asNumber(item.market_price) != null)
    if (!price || asNumber(price.market_price) == null) continue
    const key = `${pair.productId}:${price.subtype}`
    if (seen.has(key)) continue
    seen.add(key)
    rows.push({
      product_id: pair.productId,
      subtype: price.subtype,
      captured_on: today,
      market_price: asNumber(price.market_price),
      low_price: asNumber(price.low_price),
      mid_price: asNumber(price.mid_price),
    })
  }
  await chunkUpsert(client, 'price_history', rows, 'product_id,subtype,captured_on')
}

export async function productDetail(client, params) {
  const productId = Number(params.get('id'))
  if (!Number.isInteger(productId) || productId <= 0) throw httpError('That product was not found.', 400)
  const products = await loadProducts(client, [productId])
  const product = products[0]
  if (!product) throw httpError('That product is not in the catalog yet. Search its set first.', 404)
  let priceMap = await pricesFor(client, [productId])
  let prices = priceMap.get(productId) || []
  const today = utcDay()
  const stale = prices.length === 0 || prices.some((price) => (price.updated_on || '') < today)
  if (stale) {
    const keys = new Set(prices.map((price) => `${productId}:${price.subtype}`))
    keys.add(`${productId}:${params.get('subtype') || 'Normal'}`)
    await refreshGroupPrices(client, product.category_id, product.group_id, keys)
    priceMap = await pricesFor(client, [productId])
    prices = priceMap.get(productId) || []
  }
  const shaped = shapeProduct(product, prices)
  const subtype = params.get('subtype') || shaped.prices.find((price) => price.market != null)?.subtype || shaped.prices[0]?.subtype || 'Normal'
  await snapshotCached(client, prices.map((price) => ({ productId, subtype: price.subtype })), priceMap)
  const since = new Date(Date.now() - 420 * 86400000).toISOString().slice(0, 10)
  const { data, error } = await client
    .from('price_history')
    .select('*')
    .eq('product_id', productId)
    .gte('captured_on', since)
    .order('captured_on')
  if (error) throw new Error(error.message)
  const history = historyFor(data, subtype)
  const selected = shaped.prices.find((price) => price.subtype === subtype) || null
  return {
    product: shaped,
    subtype,
    history,
    previous: previousClose(history, today),
    market: selected?.market ?? null,
    updatedOn: selected?.updatedOn || null,
  }
}

export async function quotesFor(client, body) {
  const items = (Array.isArray(body.items) ? body.items : [])
    .map((item) => ({ productId: Number(item.productId), subtype: String(item.subtype || '') }))
    .filter((item) => Number.isInteger(item.productId) && item.productId > 0)
    .slice(0, 80)
  if (!items.length) return { items: [] }
  const ids = [...new Set(items.map((item) => item.productId))]
  const products = await loadProducts(client, ids)
  const byId = new Map(products.map((product) => [product.product_id, product]))
  const priceMap = await pricesFor(client, ids)
  await snapshotCached(client, items, priceMap)
  const since = new Date(Date.now() - 120 * 86400000).toISOString().slice(0, 10)
  const historyRows = []
  for (let index = 0; index < ids.length; index += 80) {
    const part = ids.slice(index, index + 80)
    const { data, error } = await client
      .from('price_history')
      .select('*')
      .in('product_id', part)
      .gte('captured_on', since)
      .order('captured_on')
    if (error) throw new Error(error.message)
    historyRows.push(...(data || []))
  }
  const today = utcDay()
  return {
    items: items.map((item) => {
      const product = byId.get(item.productId)
      const prices = (priceMap.get(item.productId) || []).map(shapePrice)
      const selected = prices.find((price) => price.subtype === item.subtype) || prices.find((price) => price.market != null) || null
      const history = historyFor(historyRows.filter((row) => row.product_id === item.productId), item.subtype || selected?.subtype)
      const previous = previousClose(history, today)
      const market = selected?.market ?? null
      return {
        productId: item.productId,
        subtype: item.subtype || selected?.subtype || 'Normal',
        name: product?.name || 'Unknown product',
        setName: product?.set_name || null,
        imageUrl: product?.image_url || null,
        url: product?.tcg_url || null,
        sealed: Boolean(product?.sealed),
        game: product?.game_key || null,
        number: product?.number || null,
        market,
        low: selected?.low ?? null,
        mid: selected?.mid ?? null,
        previous,
        change: market != null && previous != null ? Math.round((market - previous) * 100) / 100 : null,
        updatedOn: selected?.updatedOn || null,
        history,
      }
    }),
  }
}
