function cents(amount) {
  return Math.round((Number(amount) || 0) * 100)
}

export function roundMoney(amount) {
  return Math.round(Number(amount) * 100) / 100
}

export function allocateFees(weights, fee) {
  const count = Array.isArray(weights) ? weights.length : 0
  const feeCents = Math.round((Number(fee) || 0) * 100)
  if (!count) return []
  if (feeCents <= 0) return Array(count).fill(0)
  const basis = weights.map((weight) => {
    const cents = Math.round((Number(weight) || 0) * 100)
    return cents > 0 ? cents : 0
  })
  const total = basis.reduce((sum, value) => sum + value, 0)
  const shares = Array(count).fill(0)
  if (!total) {
    const base = Math.floor(feeCents / count)
    let left = feeCents - base * count
    for (let index = 0; index < count; index += 1) {
      shares[index] = base + (left > 0 ? 1 : 0)
      if (left > 0) left -= 1
    }
  } else {
    const raw = basis.map((weight) => (feeCents * weight) / total)
    for (let index = 0; index < count; index += 1) shares[index] = Math.floor(raw[index])
    let left = feeCents - shares.reduce((sum, value) => sum + value, 0)
    const order = raw
      .map((value, index) => ({ index, frac: value - Math.floor(value) }))
      .sort((a, b) => b.frac - a.frac || a.index - b.index)
    for (const item of order) {
      if (left <= 0) break
      shares[item.index] += 1
      left -= 1
    }
  }
  return shares.map((cents) => cents / 100)
}

export function lineCashCents(entry) {
  const gross = Math.round(Number(entry.quantity) * Number(entry.unitAmount) * 100)
  const fees = cents(entry.fees || 0)
  return entry.direction === 'out' ? gross + fees : gross - fees
}

export function lineCash(entry) {
  return lineCashCents(entry) / 100
}

function inWindow(entry, start, end) {
  if (start && entry.occurredOn < start) return false
  if (end && entry.occurredOn > end) return false
  return true
}

export function summarize(entries, start, end) {
  let spent = 0
  let made = 0
  for (const entry of entries) {
    if (!inWindow(entry, start, end)) continue
    const cash = lineCashCents(entry)
    if (entry.direction === 'out') spent += cash
    else made += cash
  }
  return {
    spent: spent / 100,
    made: made / 100,
    net: (made - spent) / 100,
  }
}

function totalCostCents(buy) {
  return Math.round(Number(buy.quantity) * Number(buy.unitAmount) * 100) + cents(buy.fees || 0)
}

export function positions(entries) {
  const salesByLot = new Map()
  for (const entry of entries) {
    if (entry.direction !== 'in' || !entry.lotId) continue
    const list = salesByLot.get(entry.lotId) || []
    list.push(entry)
    salesByLot.set(entry.lotId, list)
  }

  const lots = []
  for (const buy of entries) {
    if (buy.direction !== 'out') continue
    if (buy.itemKind === 'fee' || buy.itemKind === 'other') continue
    const sales = salesByLot.get(buy.id) || []
    const qty = Number(buy.quantity)
    const soldQty = sales.reduce((sum, sale) => sum + Number(sale.quantity), 0)
    const remaining = Math.max(0, Math.round((qty - soldQty) * 1000) / 1000)
    const total = totalCostCents(buy)
    const costLeftCents = qty > 0 ? Math.round((total / qty) * remaining) : 0
    lots.push({
      buy,
      sales,
      soldQty: Math.round(soldQty * 1000) / 1000,
      remaining,
      oversold: soldQty - qty > 0.0001,
      unitCost: qty > 0 ? roundMoney(total / qty / 100) : 0,
      costLeft: costLeftCents / 100,
    })
  }

  lots.sort((a, b) => {
    const byDate = b.buy.occurredOn.localeCompare(a.buy.occurredOn)
    if (byDate) return byDate
    return (b.buy.createdAt || '').localeCompare(a.buy.createdAt || '')
  })
  return lots
}

function saleTakeCents(buy, sale) {
  if (!buy || !sale || sale.direction !== 'in' || !sale.lotId) return null
  const qty = Number(buy.quantity)
  if (!(qty > 0)) return null
  const proceeds = lineCashCents(sale)
  const cost = Math.round((totalCostCents(buy) / qty) * Number(sale.quantity))
  return { proceeds, cost, profit: proceeds - cost }
}

export function saleTake(buy, sale) {
  const taken = saleTakeCents(buy, sale)
  if (!taken) return null
  return {
    proceeds: taken.proceeds / 100,
    cost: taken.cost / 100,
    profit: taken.profit / 100,
  }
}

function profitCents(entry, byId) {
  if (entry.direction === 'in' && entry.lotId) {
    const taken = saleTakeCents(byId.get(entry.lotId), entry)
    if (taken) return taken.profit
    return lineCashCents(entry)
  }
  if (entry.direction === 'in') return lineCashCents(entry)
  if (entry.direction === 'out' && (entry.itemKind === 'fee' || entry.itemKind === 'other')) return -lineCashCents(entry)
  return 0
}

export function booksProfit(entries, start, end) {
  const byId = new Map(entries.map((entry) => [entry.id, entry]))
  let total = 0
  let sales = 0
  for (const entry of entries) {
    if (!inWindow(entry, start, end)) continue
    if (entry.direction === 'in' && entry.lotId && saleTakeCents(byId.get(entry.lotId), entry)) sales += 1
    total += profitCents(entry, byId)
  }
  return { total: total / 100, sales }
}

function profitBuckets(entries, keyOf) {
  const byId = new Map(entries.map((entry) => [entry.id, entry]))
  const map = new Map()
  for (const entry of entries) {
    const key = keyOf(entry)
    if (key == null) continue
    map.set(key, (map.get(key) || 0) + profitCents(entry, byId))
  }
  return map
}

export function realized(entries, start, end) {
  const byId = new Map(entries.map((entry) => [entry.id, entry]))
  let total = 0
  let count = 0
  for (const sale of entries) {
    if (!inWindow(sale, start, end)) continue
    const taken = saleTakeCents(byId.get(sale.lotId), sale)
    if (!taken) continue
    total += taken.profit
    count += 1
  }
  return { total: total / 100, count }
}

export function monthNets(entries, year) {
  const nets = Array(12).fill(0)
  const prefix = `${year}-`
  for (const entry of entries) {
    if (!entry.occurredOn.startsWith(prefix)) continue
    const month = Number(entry.occurredOn.slice(5, 7)) - 1
    if (month < 0 || month > 11) continue
    const cash = lineCashCents(entry)
    nets[month] += entry.direction === 'out' ? -cash : cash
  }
  return nets.map((value) => value / 100)
}

export function yearNets(entries) {
  const map = new Map()
  for (const entry of entries) {
    const year = entry.occurredOn.slice(0, 4)
    const cash = lineCashCents(entry)
    const delta = entry.direction === 'out' ? -cash : cash
    map.set(year, (map.get(year) || 0) + delta)
  }
  return [...map.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([year, value]) => ({ year, net: value / 100 }))
}

export function monthProfits(entries, year) {
  const prefix = `${year}-`
  const map = profitBuckets(entries, (entry) => {
    if (!entry.occurredOn.startsWith(prefix)) return null
    const month = Number(entry.occurredOn.slice(5, 7)) - 1
    return month >= 0 && month <= 11 ? month : null
  })
  return Array.from({ length: 12 }, (_, month) => (map.get(month) || 0) / 100)
}

export function yearProfits(entries) {
  const map = profitBuckets(entries, (entry) => entry.occurredOn.slice(0, 4))
  return [...map.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([year, cents]) => ({ year, profit: cents / 100 }))
}

export function monthBounds(year, month) {
  const start = `${year}-${String(month).padStart(2, '0')}-01`
  const last = new Date(year, month, 0).getDate()
  const end = `${year}-${String(month).padStart(2, '0')}-${String(last).padStart(2, '0')}`
  return { start, end }
}

export function yearBounds(year) {
  return { start: `${year}-01-01`, end: `${year}-12-31` }
}
