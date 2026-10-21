export function pickSubtype(prices) {
  const prefer = [
    'Normal',
    'Holofoil',
    'Unlimited Holofoil',
    'Unlimited',
    'Foil',
    '1st Edition Holofoil',
    '1st Edition',
    'Reverse Holofoil',
  ]
  const usable = (prices || []).filter((price) => price.market != null)
  for (const name of prefer) {
    const hit = usable.find((price) => price.subtype === name)
    if (hit) return hit.subtype
  }
  return (usable[0] || (prices || [])[0])?.subtype || 'Normal'
}

export function imageLarge(url) {
  if (!url) return ''
  return url
    .replace('_200w.jpg', '_in_1000x1000.jpg')
    .replace('_200w.png', '_in_1000x1000.png')
    .replace(/([?&]size=)s\b/, '$1l')
}

export function caseMarket(name, market, boxes) {
  if (market == null || Number.isNaN(Number(market))) return null
  const price = Number(market)
  if (/case/i.test(name || '')) return Math.round(price * 100) / 100
  const count = Number(boxes) || 6
  return Math.round(price * count * 100) / 100
}

export function lotMarket(kind, boxesPerCase, quoteName, market) {
  if (market == null || Number.isNaN(Number(market))) return null
  const price = Number(market)
  if (kind === 'case' && Number(boxesPerCase) > 0 && !/case/i.test(quoteName || '')) {
    return Math.round(price * Number(boxesPerCase) * 100) / 100
  }
  return price
}

export function quoteKey(productId, subtype) {
  return `${productId}:${subtype || ''}`
}

export function toCad(usd, usdCad) {
  if (usd == null || usdCad == null || usd === '' || usdCad === '') return null
  const price = Number(usd)
  const rate = Number(usdCad)
  if (!Number.isFinite(price) || !Number.isFinite(rate) || rate <= 0) return null
  return Math.round(price * rate * 100) / 100
}
