const OTHER_LANGUAGE = /\b(chinese|japanese|korean|spanish|french|german|italian|portuguese|jpn|jp|chn|kor)\b/i

function englishCopy(sale) {
  const language = String(sale?.language || 'English').trim().toLowerCase()
  if (language !== 'english') return false
  return !OTHER_LANGUAGE.test(String(sale?.title || ''))
}

export function pickSale(sales, subtype) {
  const wanted = String(subtype || 'Normal').trim().toLowerCase()
  const rows = (sales || []).filter((sale) => Number.isFinite(Number(sale?.purchasePrice)) && englishCopy(sale))
  return rows.find((sale) => String(sale.variant || 'Normal').trim().toLowerCase() === wanted) || null
}

export function saleGap(market, lastSold) {
  if (market == null || lastSold == null || !Number.isFinite(market) || !Number.isFinite(lastSold) || market === 0) {
    return { change: null, pct: null }
  }
  const change = Math.round((lastSold - market) * 100) / 100
  const pct = (change / market) * 100
  return { change, pct }
}
