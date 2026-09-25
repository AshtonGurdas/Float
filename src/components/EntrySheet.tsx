import { useEffect, useMemo, useState } from 'react'
import { searchProducts, type CatalogProduct } from '../lib/api.ts'
import { lineCash, positions, roundMoney, type Direction, type Entry, type ItemKind } from '../lib/books.ts'
import { GAMES } from '../../shared/games.js'
import { kindLabel, money, parseMoney, parseQty, todayISO } from '../lib/format.ts'
import { pickSubtype } from '../lib/market.ts'
import type { EntryInput } from '../lib/rows.ts'
import { useShop } from '../store.tsx'

const KINDS: { id: ItemKind; label: string }[] = [
  { id: 'card', label: 'Card' },
  { id: 'box', label: 'Booster box' },
  { id: 'case', label: 'Case' },
  { id: 'sealed', label: 'Other sealed' },
  { id: 'fee', label: 'Fee' },
  { id: 'other', label: 'Other' },
]

const PLACEHOLDER: Record<ItemKind, string> = {
  card: 'Umbreon VMAX 215/203',
  box: 'Prismatic Evolutions booster box',
  case: 'Prismatic Evolutions booster case',
  sealed: 'Prismatic Evolutions ETB',
  fee: 'Shipping',
  other: 'Table at the card show',
}

type FormState = {
  direction: Direction
  itemKind: ItemKind
  title: string
  detail: string
  quantityText: string
  priceText: string
  priceMode: 'each' | 'total'
  feesText: string
  occurredOn: string
  notes: string
  productId: number | null
  subtype: string | null
  attachedName: string
  boxesText: string
  lotId: string | null
}

function blank(partial?: Partial<Entry> & { attachedName?: string }): FormState {
  return {
    direction: partial?.direction || 'out',
    itemKind: partial?.itemKind || 'card',
    title: partial?.title || '',
    detail: partial?.detail || '',
    quantityText: partial?.quantity != null ? String(partial.quantity) : '1',
    priceText: partial?.unitAmount != null && partial.unitAmount > 0 ? String(partial.unitAmount) : '',
    priceMode: 'each',
    feesText: partial?.fees ? String(partial.fees) : '',
    occurredOn: partial?.occurredOn || todayISO(),
    notes: partial?.notes || '',
    productId: partial?.productId ?? null,
    subtype: partial?.subtype ?? null,
    attachedName: partial?.attachedName || '',
    boxesText: String(partial?.boxesPerCase || 6),
    lotId: partial?.lotId ?? null,
  }
}

export function EntrySheet() {
  const { draft, closeDraft, entries, saveEntry, deleteEntry } = useShop()
  const [form, setForm] = useState<FormState>(() => blank())
  const [prices, setPrices] = useState<CatalogProduct['prices']>([])
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [finder, setFinder] = useState('')
  const [game, setGame] = useState(() => localStorage.getItem('float.game') || 'pokemon')
  const [hits, setHits] = useState<CatalogProduct[]>([])
  const [finding, setFinding] = useState(false)
  const [showFinder, setShowFinder] = useState(false)

  useEffect(() => {
    if (!draft) return
    setError(null)
    setConfirmDelete(false)
    setHits([])
    setFinder('')
    setShowFinder(false)
    if (draft.mode === 'edit') {
      setForm(blank({ ...draft.entry, attachedName: draft.entry.productId ? draft.entry.title : '' }))
      setPrices([])
      return
    }
    if (draft.mode === 'sell') {
      setForm(blank({
        direction: 'in',
        itemKind: draft.buy.itemKind,
        title: draft.buy.title,
        detail: draft.buy.detail,
        quantity: 1,
        productId: draft.buy.productId,
        subtype: draft.buy.subtype,
        boxesPerCase: draft.buy.boxesPerCase,
        lotId: draft.buy.id,
        attachedName: draft.buy.productId ? draft.buy.title : '',
        occurredOn: todayISO(),
      }))
      setPrices([])
      return
    }
    setForm(blank(draft.preset))
    setPrices(draft.preset?.prices || [])
  }, [draft])

  useEffect(() => {
    if (!draft) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeDraft()
    }
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = ''
      window.removeEventListener('keydown', onKey)
    }
  }, [draft, closeDraft])

  useEffect(() => {
    if (!showFinder) return
    const query = finder.trim()
    if (query.length < 2) {
      setHits([])
      return
    }
    let live = true
    const timer = window.setTimeout(() => {
      setFinding(true)
      searchProducts(game, query, 'all')
        .then((data) => {
          if (live) setHits(data.results)
        })
        .catch((err: unknown) => {
          if (live) setError(err instanceof Error ? err.message : 'Search failed.')
        })
        .finally(() => {
          if (live) setFinding(false)
        })
    }, 300)
    return () => {
      live = false
      window.clearTimeout(timer)
    }
  }, [finder, game, showFinder])

  const editingId = draft?.mode === 'edit' ? draft.entry.id : undefined
  const sellingBuy = draft?.mode === 'sell' ? draft.buy : null

  const maxQty = useMemo(() => {
    if (!draft) return null
    if (draft.mode === 'sell') {
      return positions(entries).find((lot) => lot.buy.id === draft.buy.id)?.remaining ?? null
    }
    if (draft.mode === 'edit' && draft.entry.direction === 'in' && draft.entry.lotId) {
      const others = entries.filter((entry) => entry.id !== draft.entry.id)
      return positions(others).find((lot) => lot.buy.id === draft.entry.lotId)?.remaining ?? null
    }
    return null
  }, [draft, entries])

  if (!draft) return null

  function patch(partial: Partial<FormState>) {
    setForm((current) => ({ ...current, ...partial }))
  }

  function chooseKind(itemKind: ItemKind) {
    if (itemKind === 'fee') patch({ itemKind, direction: 'out', quantityText: '1' })
    else patch({ itemKind })
  }

  function chooseDirection(direction: Direction) {
    if (direction === 'in' && form.itemKind === 'fee') patch({ direction, itemKind: 'other' })
    else patch({ direction })
  }

  function switchPriceMode(next: 'each' | 'total') {
    const qty = parseQty(form.quantityText) || 1
    const amount = parseMoney(form.priceText)
    if (amount != null && !Number.isNaN(amount) && qty > 0) {
      const converted = next === 'total' ? roundMoney(amount * qty) : roundMoney(amount / qty)
      patch({ priceMode: next, priceText: String(converted) })
      return
    }
    patch({ priceMode: next })
  }

  function attach(hit: CatalogProduct) {
    const subtype = pickSubtype(hit.prices)
    setPrices(hit.prices)
    patch({
      productId: hit.productId,
      subtype,
      attachedName: hit.name,
      title: form.title.trim() ? form.title : hit.number ? `${hit.name} ${hit.number}` : hit.name,
      detail: form.detail.trim() ? form.detail : hit.setName || '',
    })
    setShowFinder(false)
  }

  const qty = parseQty(form.quantityText)
  const typed = parseMoney(form.priceText)
  const fees = parseMoney(form.feesText)
  const unit = typed == null || Number.isNaN(typed) || !qty
    ? 0
    : form.priceMode === 'total'
      ? roundMoney(typed / qty)
      : typed
  const previewEntry = {
    id: 'preview',
    direction: form.direction,
    itemKind: form.itemKind,
    title: form.title,
    detail: form.detail,
    quantity: qty || 0,
    unitAmount: unit,
    fees: form.itemKind === 'fee' ? 0 : fees && !Number.isNaN(fees) ? fees : 0,
    occurredOn: form.occurredOn,
    notes: form.notes,
    productId: form.productId,
    subtype: form.subtype,
    boxesPerCase: form.itemKind === 'case' ? Number(form.boxesText) || 6 : null,
    lotId: form.lotId,
    createdAt: '',
  }
  const previewCash = qty ? lineCash(previewEntry) : 0
  const selectedPrice = prices.find((price) => price.subtype === form.subtype)

  async function onSave() {
    setError(null)
    if (!form.title.trim()) {
      setError('Name the card, case, or fee.')
      return
    }
    if (!qty) {
      setError('Enter a quantity greater than zero.')
      return
    }
    if (typed == null || Number.isNaN(typed)) {
      setError('Enter the price.')
      return
    }
    if (fees != null && Number.isNaN(fees)) {
      setError('Fees should be a dollar amount.')
      return
    }
    if (maxQty != null && qty > maxQty + 0.0001) {
      setError(`Only ${maxQty} left on that purchase.`)
      return
    }
    if (draft?.mode === 'edit' && draft.entry.direction === 'out') {
      const sold = positions(entries).find((lot) => lot.buy.id === draft.entry.id)?.soldQty || 0
      if (qty + 0.0001 < sold) {
        setError(`You already sold ${sold}. Quantity can't go below that.`)
        return
      }
    }
    const input: EntryInput = {
      direction: form.itemKind === 'fee' ? 'out' : form.direction,
      itemKind: form.itemKind,
      title: form.title.trim(),
      detail: form.detail.trim(),
      quantity: form.itemKind === 'fee' ? 1 : qty,
      unitAmount: unit,
      fees: form.itemKind === 'fee' ? 0 : fees || 0,
      occurredOn: form.occurredOn,
      notes: form.notes,
      productId: form.productId,
      subtype: form.subtype,
      boxesPerCase: form.itemKind === 'case' ? Math.max(1, Number(form.boxesText) || 6) : null,
      lotId: form.lotId,
    }
    setSaving(true)
    try {
      await saveEntry(input, editingId)
      closeDraft()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save that entry.')
    } finally {
      setSaving(false)
    }
  }

  async function onDelete() {
    if (!editingId) return
    setSaving(true)
    try {
      await deleteEntry(editingId)
      closeDraft()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete that entry.')
      setSaving(false)
    }
  }

  const heading = draft.mode === 'sell' ? 'Record a sale' : draft.mode === 'edit' ? 'Edit entry' : 'Add to the books'
  const sentence = describe(previewEntry, previewCash)

  return (
    <div className="backdrop" onMouseDown={closeDraft}>
      <div
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="entry-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="grab" aria-hidden="true" />
        <div className="sheet-head">
          <h2 id="entry-title">{heading}</h2>
          <button type="button" className="btn ghost" onClick={closeDraft}>Close</button>
        </div>
        {sellingBuy ? (
          <p className="quiet">Selling from {sellingBuy.title}. {maxQty == null ? '' : `${maxQty} still on hand.`}</p>
        ) : (
          <div className="seg" role="group" aria-label="Money direction">
            <button type="button" aria-pressed={form.direction === 'out'} onClick={() => chooseDirection('out')}>Spent</button>
            <button type="button" aria-pressed={form.direction === 'in'} onClick={() => chooseDirection('in')}>Made</button>
          </div>
        )}
        {draft.mode !== 'sell' ? (
          <div className="kind-grid" role="group" aria-label="What this is">
            {KINDS.map((kind) => (
              <button key={kind.id} type="button" className="chip" aria-pressed={form.itemKind === kind.id} onClick={() => chooseKind(kind.id)}>
                {kind.label}
              </button>
            ))}
          </div>
        ) : null}
        <label className="field">
          Name
          <input
            value={form.title}
            onChange={(event) => patch({ title: event.target.value })}
            placeholder={PLACEHOLDER[form.itemKind]}
            autoComplete="off"
            maxLength={180}
          />
        </label>
        {form.itemKind !== 'fee' ? (
          <label className="field">
            Details
            <input
              value={form.detail}
              onChange={(event) => patch({ detail: event.target.value })}
              placeholder="Set, condition, or where it came from"
              autoComplete="off"
            />
          </label>
        ) : null}
        {form.itemKind === 'case' ? (
          <label className="field">
            Boxes in the case
            <input
              inputMode="numeric"
              value={form.boxesText}
              onChange={(event) => patch({ boxesText: event.target.value.replace(/[^\d]/g, '') })}
            />
          </label>
        ) : null}
        {form.itemKind !== 'fee' ? (
          <div className="split-fields">
            <label className="field">
              Quantity
              <input inputMode="decimal" value={form.quantityText} onChange={(event) => patch({ quantityText: event.target.value })} />
            </label>
            <label className="field">
              {form.priceMode === 'total' ? 'Total price' : 'Price each'}
              <input inputMode="decimal" value={form.priceText} onChange={(event) => patch({ priceText: event.target.value })} placeholder="0.00" />
            </label>
          </div>
        ) : (
          <label className="field">
            Amount
            <input inputMode="decimal" value={form.priceText} onChange={(event) => patch({ priceText: event.target.value })} placeholder="0.00" />
          </label>
        )}
        {form.itemKind !== 'fee' && draft.mode !== 'sell' ? (
          <div className="seg slim" role="group" aria-label="Price is each or total">
            <button type="button" aria-pressed={form.priceMode === 'each'} onClick={() => switchPriceMode('each')}>Each</button>
            <button type="button" aria-pressed={form.priceMode === 'total'} onClick={() => switchPriceMode('total')}>Total</button>
          </div>
        ) : null}
        {form.itemKind !== 'fee' ? (
          <label className="field">
            {form.direction === 'in' ? 'Fees taken out' : 'Extra fees'}
            <input inputMode="decimal" value={form.feesText} onChange={(event) => patch({ feesText: event.target.value })} placeholder="Shipping, tax, platform" />
          </label>
        ) : null}
        <label className="field">
          Date
          <input type="date" value={form.occurredOn} onChange={(event) => patch({ occurredOn: event.target.value })} />
        </label>
        <label className="field">
          Note
          <textarea value={form.notes} onChange={(event) => patch({ notes: event.target.value })} rows={2} placeholder="Optional" />
        </label>
        {draft.mode !== 'sell' && form.itemKind !== 'fee' ? (
          <div className="attach">
            {form.productId ? (
              <div className="attached">
                <div>
                  <strong>{form.attachedName || 'TCGplayer listing'}</strong>
                  <span>{form.subtype}{selectedPrice?.market != null ? ` · market ${money(selectedPrice.market)}` : ''}</span>
                </div>
                <button
                  type="button"
                  className="btn ghost"
                  onClick={() => {
                    setPrices([])
                    patch({ productId: null, subtype: null, attachedName: '' })
                  }}
                >
                  Remove
                </button>
              </div>
            ) : (
              <button type="button" className="btn ghost" onClick={() => setShowFinder((open) => !open)}>
                {showFinder ? 'Hide TCGplayer search' : 'Attach a TCGplayer price'}
              </button>
            )}
            {prices.length > 1 && form.productId ? (
              <label className="field">
                Printing
                <select value={form.subtype || ''} onChange={(event) => patch({ subtype: event.target.value })}>
                  {prices.map((price) => (
                    <option key={price.subtype} value={price.subtype}>
                      {price.subtype}{price.market != null ? ` · ${money(price.market)}` : ''}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            {showFinder && !form.productId ? (
              <div className="finder">
                <label className="field">
                  Game
                  <select
                    value={game}
                    onChange={(event) => {
                      setGame(event.target.value)
                      localStorage.setItem('float.game', event.target.value)
                    }}
                  >
                    {GAMES.map((item) => (
                      <option key={item.key} value={item.key}>{item.name}</option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  Search TCGplayer
                  <input value={finder} onChange={(event) => setFinder(event.target.value)} placeholder="Set name and card, or booster box" autoComplete="off" />
                </label>
                {finding ? <p className="quiet">Searching…</p> : null}
                <div className="mini-list">
                  {hits.slice(0, 8).map((hit) => (
                    <button key={hit.productId} type="button" className="mini-result" onClick={() => attach(hit)}>
                      <span>{hit.name}</span>
                      <small>{hit.setName}{hit.sealed ? ' · sealed' : ''}</small>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
            <p className="quiet">Optional. Attach a listing and Stock can compare what you paid with the market.</p>
          </div>
        ) : null}
        <p className="preview-line" aria-live="polite">{sentence}</p>
        {error ? <p className="error-text">{error}</p> : null}
        <button type="button" className="btn wide" onClick={onSave} disabled={saving}>
          {saving ? 'Saving…' : draft.mode === 'sell' ? 'Save sale' : 'Save entry'}
        </button>
        {editingId ? (
          confirmDelete ? (
            <div className="confirm-row">
              <span>Delete this entry?</span>
              <button type="button" className="btn danger" onClick={onDelete} disabled={saving}>Delete</button>
              <button type="button" className="btn ghost" onClick={() => setConfirmDelete(false)}>Keep</button>
            </div>
          ) : (
            <button type="button" className="btn ghost wide" onClick={() => setConfirmDelete(true)}>Delete entry</button>
          )
        ) : null}
      </div>
    </div>
  )
}

function describe(entry: Entry, cash: number) {
  const name = entry.title.trim() || 'this'
  if (!entry.quantity) return 'Add a quantity and a price.'
  if (entry.itemKind === 'fee') return `Spent ${money(Math.abs(cash))} on ${name}.`
  if (entry.direction === 'in' && entry.itemKind === 'other') return `Made ${money(cash)} from ${name}.`
  const verb = entry.direction === 'out' ? 'Spent' : 'Made'
  const what = entry.itemKind === 'case' && entry.boxesPerCase
    ? counted(entry.quantity, `case of ${entry.boxesPerCase} boxes`, `cases of ${entry.boxesPerCase} boxes`)
    : counted(entry.quantity, kindLabel(entry).toLowerCase(), pluralKind(entry.itemKind))
  return `${verb} ${money(Math.abs(cash))} on ${what}: ${name}.`
}

function counted(qty: number, singular: string, plural: string) {
  return `${qty} ${qty === 1 ? singular : plural}`
}

function pluralKind(kind: Entry['itemKind']) {
  if (kind === 'box') return 'booster boxes'
  if (kind === 'card') return 'cards'
  if (kind === 'sealed') return 'sealed items'
  if (kind === 'other') return 'other items'
  return 'items'
}
