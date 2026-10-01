import { pickSale } from '../shared/sales.js'

// TCGplayer returns 403 for this public sales endpoint unless the request looks like a browser.
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

export async function latestSale(productId, subtype) {
  const response = await fetch(`https://mpapi.tcgplayer.com/v2/product/${productId}/latestsales`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'Accept-Language': 'en-US,en;q=0.9',
      Origin: 'https://www.tcgplayer.com',
      Referer: `https://www.tcgplayer.com/product/${productId}`,
      'User-Agent': UA,
      'sec-ch-ua': '"Chromium";v="131", "Not_A Brand";v="24"',
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-platform': '"Windows"',
      'sec-fetch-dest': 'empty',
      'sec-fetch-mode': 'cors',
      'sec-fetch-site': 'same-site',
    },
    body: '{}',
    signal: AbortSignal.timeout(12000),
  })
  if (!response.ok) throw new Error(`TCGplayer sales ${response.status}`)
  const payload = await response.json()
  const sale = pickSale(payload?.data, subtype)
  if (!sale) return { price: null, condition: null, soldAt: null }
  return {
    price: Number(sale.purchasePrice),
    condition: sale.condition ? String(sale.condition) : null,
    soldAt: sale.orderDate ? String(sale.orderDate) : null,
  }
}
