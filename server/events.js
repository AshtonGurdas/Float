const LIST_PAGES = [
  'https://sportscardsnearme.ca/shows/british-columbia-2026/',
  'https://sportscardsnearme.ca/shows/british-columbia-2027/',
]

const MONTHS = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
}

const EXTRA = [
  {
    name: 'Vancouver Comic and Toy Show',
    start: '2026-09-26',
    end: '2026-09-27',
    city: 'Vancouver',
    venue: 'PNE Forum',
    fee: '$15–$25',
    free: false,
    note: 'Kids 12 and under free. Comic and toy show with TCG vendors.',
    url: 'https://vancouver.page/event/vancouver-comic-toy-show/',
  },
  {
    name: 'Okanagan Collectors Fest',
    start: '2026-11-21',
    end: '2026-11-22',
    city: 'Kelowna',
    venue: 'Coast Capri Hotel',
    fee: 'Free',
    free: true,
    note: '9:00 AM – 4:00 PM both days.',
    url: 'https://www.vaultedgems.com/show',
  },
]

let cache = null

function vancouverToday() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Vancouver',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

function isoDate(monthName, day, year) {
  const month = MONTHS[String(monthName || '').toLowerCase()]
  if (!month) return null
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function parseWhen(text) {
  const range = text.split(/\s+[–—-]\s+/)
  const startMatch = range[0].trim().match(/^([A-Za-z]+)\s+(\d{1,2}),\s+(\d{4})$/)
  if (!startMatch) return null
  const start = isoDate(startMatch[1], startMatch[2], startMatch[3])
  if (!start) return null
  if (!range[1]) return { start, end: start }
  const endMatch = range[1].trim().match(/^([A-Za-z]+)\s+(\d{1,2}),\s+(\d{4})$/)
  const end = endMatch ? isoDate(endMatch[1], endMatch[2], endMatch[3]) : start
  return { start, end: end || start }
}

function feeFromText(text) {
  if (!text) return { fee: null, free: null }
  if (/^free$/i.test(text)) return { fee: 'Free', free: true }
  if (/early-bird|see tickets|ticket/i.test(text) && !/\$\d/.test(text)) return { fee: 'Paid — see tickets', free: false }
  return { fee: text, free: false }
}

function parsePage(html) {
  const events = []
  const pattern = /<a href="(\/shows\/[^"]+)"[^>]*>\s*<h3[^>]*>([^<]+)<\/h3>\s*<p[^>]*>([^<]+)<\/p>\s*<p[^>]*>([^<]+)<\/p>/g
  for (const match of html.matchAll(pattern)) {
    const when = parseWhen(match[3])
    if (!when) continue
    const place = match[4].split('·').map((part) => part.trim()).filter(Boolean)
    const fee = feeFromText(place.length > 2 ? place.slice(2).join(' · ') : '')
    events.push({
      name: match[2].trim(),
      start: when.start,
      end: when.end,
      city: (place[0] || '').replace(/,?\s*BC$/i, ''),
      venue: place[1] || '',
      fee: fee.fee,
      free: fee.free,
      note: '',
      url: `https://sportscardsnearme.ca${match[1]}`,
    })
  }
  return events
}

const KNOWN_FEES = [
  { test: /west van card show @ ubc/i, fee: '$10 cash or $11 card', free: false, note: 'Kids 7 and under free with an adult.' },
]

function applyKnownFees(events) {
  for (const event of events) {
    if (event.fee) continue
    const known = KNOWN_FEES.find((item) => item.test.test(event.name))
    if (!known) continue
    event.fee = known.fee
    event.free = known.free
    event.note = known.note
  }
  return events
}

function upcoming(events, today) {
  const seen = new Set()
  return events
    .filter((event) => event.end >= today)
    .filter((event) => {
      const key = `${event.name}|${event.start}|${event.city}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .sort((a, b) => a.start.localeCompare(b.start) || a.name.localeCompare(b.name))
}

export async function bcEvents() {
  const today = vancouverToday()
  if (cache && cache.today === today && Date.now() - cache.at < 6 * 60 * 60 * 1000) return cache.payload
  const fetched = []
  for (const url of LIST_PAGES) {
    try {
      const response = await fetch(url, {
        headers: { 'User-Agent': 'Float/1.0 (personal TCG shop books)', Accept: 'text/html' },
        signal: AbortSignal.timeout(12000),
      })
      if (!response.ok) continue
      fetched.push(...parsePage(await response.text()))
    } catch (error) {
      console.error('BC events page failed', url, error instanceof Error ? error.message : error)
    }
  }
  const events = upcoming(applyKnownFees([...fetched, ...EXTRA]), today)
  const payload = {
    events,
    updatedAt: new Date().toISOString(),
    source: 'https://sportscardsnearme.ca/shows/british-columbia-2026/',
  }
  if (events.length) cache = { today, at: Date.now(), payload }
  return payload
}
