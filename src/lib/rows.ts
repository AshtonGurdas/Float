import type { Direction, Entry, ItemKind } from './books.ts'

export type EntryInput = Omit<Entry, 'id' | 'createdAt'>

type EntryRow = {
  id: string
  direction: Direction
  item_kind: ItemKind
  title: string
  detail: string | null
  quantity: number | string
  unit_amount: number | string
  fees: number | string | null
  occurred_on: string
  notes: string | null
  product_id: number | null
  subtype: string | null
  boxes_per_case: number | null
  lot_id: string | null
  shop_id: string | null
  customer_id: string | null
  tracking_number: string | null
  tracking_carrier: string | null
  arrives_on: string | null
  order_id: string | null
  expect_each: number | string | null
  created_at: string
}

export function entryFromRow(row: EntryRow): Entry {
  return {
    id: row.id,
    direction: row.direction,
    itemKind: row.item_kind,
    title: row.title,
    detail: row.detail || '',
    quantity: Number(row.quantity),
    unitAmount: Number(row.unit_amount),
    fees: Number(row.fees) || 0,
    occurredOn: row.occurred_on,
    notes: row.notes || '',
    productId: row.product_id == null ? null : Number(row.product_id),
    subtype: row.subtype,
    boxesPerCase: row.boxes_per_case == null ? null : Number(row.boxes_per_case),
    lotId: row.lot_id,
    shopId: row.shop_id,
    customerId: row.customer_id,
    trackingNumber: row.tracking_number,
    trackingCarrier: row.tracking_carrier,
    arrivesOn: row.arrives_on,
    orderId: row.order_id || null,
    expectEach: row.expect_each == null || row.expect_each === '' ? null : Number(row.expect_each),
    createdAt: row.created_at,
  }
}

export function entryToRow(entry: EntryInput, userId: string) {
  return {
    user_id: userId,
    direction: entry.direction,
    item_kind: entry.itemKind,
    title: entry.title.trim(),
    detail: entry.detail.trim() || null,
    quantity: entry.quantity,
    unit_amount: entry.unitAmount,
    fees: entry.fees,
    occurred_on: entry.occurredOn,
    notes: entry.notes.trim() || null,
    product_id: entry.productId,
    subtype: entry.subtype,
    boxes_per_case: entry.itemKind === 'case' ? entry.boxesPerCase : null,
    lot_id: entry.lotId,
    shop_id: entry.shopId,
    customer_id: entry.customerId,
    tracking_number: entry.trackingNumber?.trim() || null,
    tracking_carrier: entry.trackingNumber?.trim() ? entry.trackingCarrier || 'other' : null,
    arrives_on: entry.arrivesOn || null,
    order_id: entry.orderId || null,
    expect_each: entry.expectEach == null || Number.isNaN(entry.expectEach) ? null : entry.expectEach,
  }
}

export type ShopShipping = 'fast' | 'ok' | 'slow' | 'waiting'
export type ShopQuality = 'great' | 'ok' | 'poor' | 'unchecked'
export type ShopLegit = 'yes' | 'unsure' | 'no'
export type ShopAgain = 'yes' | 'maybe' | 'no'

export type Shop = {
  id: string
  name: string
  whereFrom: string
  shipping: ShopShipping
  quality: ShopQuality
  legit: ShopLegit
  again: ShopAgain
  notes: string
  createdAt: string
  updatedAt: string
}

type ShopRow = {
  id: string
  name: string
  where_from: string | null
  shipping: ShopShipping
  quality: ShopQuality
  legit: ShopLegit
  again: ShopAgain
  notes: string | null
  created_at: string
  updated_at: string
}

export function shopFromRow(row: ShopRow): Shop {
  return {
    id: row.id,
    name: row.name,
    whereFrom: row.where_from || '',
    shipping: row.shipping,
    quality: row.quality,
    legit: row.legit,
    again: row.again,
    notes: row.notes || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function entryFields(entry: Entry): EntryInput {
  return {
    direction: entry.direction,
    itemKind: entry.itemKind,
    title: entry.title,
    detail: entry.detail,
    quantity: entry.quantity,
    unitAmount: entry.unitAmount,
    fees: entry.fees,
    occurredOn: entry.occurredOn,
    notes: entry.notes,
    productId: entry.productId,
    subtype: entry.subtype,
    boxesPerCase: entry.boxesPerCase,
    lotId: entry.lotId,
    shopId: entry.shopId,
    customerId: entry.customerId,
    trackingNumber: entry.trackingNumber,
    trackingCarrier: entry.trackingCarrier,
    arrivesOn: entry.arrivesOn,
    orderId: entry.orderId,
    expectEach: entry.expectEach,
  }
}

export type Customer = {
  id: string
  name: string
  notes: string
  regular: boolean
  createdAt: string
  updatedAt: string
}

type CustomerRow = {
  id: string
  name: string
  notes: string | null
  regular: boolean
  created_at: string
  updated_at: string
}

export function customerFromRow(row: CustomerRow): Customer {
  return {
    id: row.id,
    name: row.name,
    notes: row.notes || '',
    regular: Boolean(row.regular),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function customerToRow(customer: Omit<Customer, 'id' | 'createdAt' | 'updatedAt'>, userId: string) {
  return {
    user_id: userId,
    name: customer.name.trim(),
    notes: customer.notes.trim() || null,
    regular: customer.regular,
    updated_at: new Date().toISOString(),
  }
}

export function shopToRow(shop: Omit<Shop, 'id' | 'createdAt' | 'updatedAt'>, userId: string) {
  return {
    user_id: userId,
    name: shop.name.trim(),
    where_from: shop.whereFrom.trim() || null,
    shipping: shop.shipping,
    quality: shop.quality,
    legit: shop.legit,
    again: shop.again,
    notes: shop.notes.trim() || null,
    updated_at: new Date().toISOString(),
  }
}

export type Watch = {
  id: string
  productId: number
  subtype: string
  name: string
  setName: string
  imageUrl: string | null
  sealed: boolean
  game: string | null
  url: string | null
  createdAt: string
}

type WatchRow = {
  id: string
  product_id: number
  subtype: string
  name: string
  set_name: string | null
  image_url: string | null
  sealed: boolean
  game_key: string | null
  tcg_url: string | null
  created_at: string
}

export function watchFromRow(row: WatchRow): Watch {
  return {
    id: row.id,
    productId: Number(row.product_id),
    subtype: row.subtype,
    name: row.name,
    setName: row.set_name || '',
    imageUrl: row.image_url,
    sealed: row.sealed,
    game: row.game_key,
    url: row.tcg_url,
    createdAt: row.created_at,
  }
}
