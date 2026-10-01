export function pickSale(sales, subtype) {
  const wanted = String(subtype || 'Normal').trim().toLowerCase()
  const rows = (sales || []).filter((sale) => Number.isFinite(Number(sale?.purchasePrice)))
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
