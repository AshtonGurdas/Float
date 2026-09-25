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
