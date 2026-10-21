export type PricePoint = {
  subtype: string
  market: number | null
}

export function pickSubtype(prices: PricePoint[]): string
export function imageLarge(url: string | null | undefined): string
export function caseMarket(name: string, market: number | null, boxes?: number | null): number | null
export function lotMarket(kind: string, boxesPerCase: number | null, quoteName: string | null | undefined, market: number | null): number | null
export function quoteKey(productId: number, subtype: string | null | undefined): string
export function toCad(usd: number | null | undefined, usdCad: number | null | undefined): number | null
