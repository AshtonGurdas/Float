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
  return url.replace('_200w.jpg', '_in_1000x1000.jpg').replace('_200w.png', '_in_1000x1000.png')
}

export function caseMarket(name, market, boxes) {
  if (market == null || Number.isNaN(Number(market))) return null
  const price = Number(market)
  if (/case/i.test(name || '')) return Math.round(price * 100) / 100
  const count = Number(boxes) || 6
  return Math.round(price * count * 100) / 100
}

export function quoteKey(productId, subtype) {
  return `${productId}:${subtype || ''}`
}
