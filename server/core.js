import { timingSafeEqual } from 'node:crypto'
import { ingestOne, latestSealed, listSets, productDetail, quotesFor, refreshPrices, search } from './catalog.js'
import { adminClient, userFromRequest } from './supabase.js'

const hits = new Map()

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  })
}

function limited(userId, bucket, max, windowMs) {
  const key = `${userId}:${bucket}`
  const now = Date.now()
  const recent = (hits.get(key) || []).filter((stamp) => now - stamp < windowMs)
  if (recent.length >= max) return true
  recent.push(now)
  hits.set(key, recent)
  return false
}

function isCron(request) {
  const secret = process.env.CRON_SECRET || ''
  if (!secret) return false
  const header = request.headers.get('authorization') || ''
  const token = header.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() || ''
  const left = Buffer.from(token)
  const right = Buffer.from(secret)
  if (left.length !== right.length) return false
  return timingSafeEqual(left, right)
}

function publicError(error) {
  const message = error instanceof Error ? error.message : 'Something went wrong.'
  if (/TCGCSV|fetch|abort|network|timeout/i.test(message)) {
    return 'Could not reach TCGplayer prices. Try again in a minute.'
  }
  return message.slice(0, 240)
}

async function readJson(request) {
  if (request.method === 'GET' || request.method === 'HEAD') return {}
  const body = await request.json().catch(() => null)
  if (body == null || typeof body !== 'object') return {}
  return body
}

export async function handleApi(request) {
  const url = new URL(request.url)
  const path = url.pathname.replace(/\/$/, '') || '/'
  const method = request.method.toUpperCase()

  if (path === '/api/health' && method === 'GET') {
    return json(200, { ok: true, prices: 'tcgplayer' })
  }

  try {
    const client = adminClient()
    if (!client) return json(500, { error: 'Supabase is not configured on the server.' })

    const cron = path === '/api/prices/refresh' && isCron(request)
    const user = cron ? null : await userFromRequest(client, request)
    if (!cron && !user) return json(401, { error: 'Sign in required.' })

    if (path === '/api/search' && method === 'POST') {
      if (limited(user.id, 'search', 24, 60_000)) return json(429, { error: 'Too many searches. Wait a minute.' })
      return json(200, await search(client, await readJson(request)))
    }
    if (path === '/api/sets' && method === 'GET') {
      return json(200, await listSets(client, url.searchParams.get('game') || ''))
    }
    if (path === '/api/ingest' && method === 'POST') {
      if (limited(user.id, 'ingest', 12, 60_000)) return json(429, { error: 'Too many set loads. Wait a minute.' })
      return json(200, await ingestOne(client, await readJson(request)))
    }
    if (path === '/api/latest' && method === 'GET') {
      if (limited(user.id, 'latest', 8, 60_000)) return json(429, { error: 'Wait a minute before loading more sets.' })
      return json(200, await latestSealed(client, url.searchParams.get('game') || ''))
    }
    if (path === '/api/product' && method === 'GET') {
      return json(200, await productDetail(client, url.searchParams))
    }
    if (path === '/api/quotes' && method === 'POST') {
      return json(200, await quotesFor(client, await readJson(request)))
    }
    if (path === '/api/prices/refresh' && (method === 'GET' || method === 'POST')) {
      if (!cron && limited(user.id, 'refresh', 6, 60_000)) {
        return json(429, { error: 'Prices were just updated. Wait a minute.' })
      }
      const body = method === 'POST' ? await readJson(request) : {}
      const result = await refreshPrices(client, {
        userId: user?.id || null,
        items: body.items,
        allUsers: cron && !body.items,
      })
      return json(200, result)
    }
    return json(404, { error: 'Not found.' })
  } catch (error) {
    console.error(error)
    const status = error && Number.isInteger(error.status) ? error.status : 500
    return json(status, { error: publicError(error) })
  }
}
