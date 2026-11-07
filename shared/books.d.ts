export type Direction = 'out' | 'in'
export type ItemKind = 'card' | 'box' | 'case' | 'sealed' | 'fee' | 'other'

export type Entry = {
  id: string
  direction: Direction
  itemKind: ItemKind
  title: string
  detail: string
  quantity: number
  unitAmount: number
  fees: number
  occurredOn: string
  notes: string
  productId: number | null
  subtype: string | null
  boxesPerCase: number | null
  lotId: string | null
  shopId: string | null
  customerId: string | null
  trackingNumber: string | null
  trackingCarrier: string | null
  arrivesOn: string | null
  orderId: string | null
  expectEach: number | null
  createdAt: string
}

export type Lot = {
  buy: Entry
  sales: Entry[]
  soldQty: number
  remaining: number
  oversold: boolean
  unitCost: number
  costLeft: number
}

export function roundMoney(amount: number): number
export function unitForTotal(total: number, quantity: number): number
export function allocateFees(weights: number[], fee: number): number[]
export function lineCashCents(entry: Entry): number
export function lineCash(entry: Entry): number
export type SalePortion = {
  quantity: number
  cents: number
  unitAmount: number
  fees: number
  rest: { quantity: number; cents: number; unitAmount: number; fees: number } | null
}
export function buyerPortion(entry: Entry, quantity: number): SalePortion | null
export function summarize(entries: Entry[], start?: string, end?: string): { spent: number; made: number; net: number }
export function positions(entries: Entry[]): Lot[]
export type Arrival = { entry: Entry; remaining: number }
export function stillArriving(entries: Entry[]): Arrival[]
export function saleTake(buy: Entry | undefined, sale: Entry): { proceeds: number; cost: number; profit: number } | null
export function realized(entries: Entry[], start?: string, end?: string): { total: number; count: number }
export function monthNets(entries: Entry[], year: number): number[]
export function yearNets(entries: Entry[]): { year: string; net: number }[]
export function monthBounds(year: number, month: number): { start: string; end: string }
export function yearBounds(year: number): { start: string; end: string }
export function costGroupKey(title: string): string
export type AverageCost = { quantity: number; lines: number; fees: number; average: number }
export function averageCosts(entries: Entry[]): Map<string, AverageCost>
export type OpenEstimateLine = {
  id: string
  each: number | null
  proceeds: number | null
  cost: number
  profit: number | null
}
export type OpenEstimate = {
  lines: OpenEstimateLine[]
  proceeds: number
  cost: number
  profit: number
  priced: number
  missing: number
}
export function openEstimate(lots: Lot[], eachOf: (lot: Lot) => number | null): OpenEstimate
