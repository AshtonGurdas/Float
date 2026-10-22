import { useEffect, useMemo, useRef, useState } from 'react'
import { searchProducts, type CatalogProduct } from '../lib/api.ts'
import { allocateFees, lineCash, positions, roundMoney, unitForTotal, type Direction, type Entry, type ItemKind } from '../lib/books.ts'
import { GAMES } from '../../shared/games.js'
import { kindLabel, money, parseMoney, parseQty, todayISO } from '../lib/format.ts'
import { pickSubtype } from '../lib/market.ts'
import { CARRIERS, guessCarrier } from '../../shared/tracking.js'
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

type LineDraft = {
  key: string
  id?: string
  itemKind: ItemKind
  title: string
  detail: string
  quantityText: string
  priceText: string
  priceMode: 'each' | 'total'
  productId: number | null
  subtype: string | null
  attachedName: string
  boxesText: string
  prices: CatalogProduct['prices']
}

type Shared = {
  direction: Direction
  feesText: string
  occurredOn: string
  notes: string
  shopId: string | null
  customerId: string | null
  trackingNumber: string
  trackingCarrier: string
  arrivesOn: string
  lotId: string | null
  orderId: string | null
}

function blankLine(partial?: Partial<Entry> & { attachedName?: string; prices?: CatalogProduct['prices']; priceMode?: 'each' | 'total' }): LineDraft {
  const kind = partial?.itemKind || 'card'
  return {
    key: partial?.id || crypto.randomUUID(),
    id: partial?.id,
    itemKind: kind,
    title: partial?.title || '',
    detail: partial?.detail || '',
    quantityText: partial?.quantity != null ? String(partial.quantity) : '1',
    priceText: partial?.unitAmount != null && partial.unitAmount > 0 ? String(partial.unitAmount) : '',
    priceMode: partial?.priceMode || 'each',
    productId: partial?.productId ?? null,
    subtype: partial?.subtype ?? null,
    attachedName: partial?.attachedName || '',
    boxesText: String(partial?.boxesPerCase || 6),
    prices: partial?.prices || [],
  }
}

function blankShared(partial?: Partial<Entry>, group?: Entry[]): Shared {
  const fees = group && group.length > 1
    ? roundMoney(group.reduce((sum, entry) => sum + (Number(entry.fees) || 0), 0))
    : partial?.fees || 0
  return {
    direction: partial?.direction || 'out',
    feesText: fees ? String(fees) : '',
    occurredOn: partial?.occurredOn || todayISO(),
    notes: partial?.notes || '',
    shopId: partial?.shopId ?? null,
    customerId: partial?.customerId ?? null,
    trackingNumber: partial?.trackingNumber || '',
    trackingCarrier: partial?.trackingCarrier || '',
    arrivesOn: partial?.arrivesOn || '',
    lotId: partial?.lotId ?? null,
    orderId: group && group.length > 1 ? partial?.orderId || group.find((entry) => entry.orderId)?.orderId || null : partial?.orderId ?? null,
  }
}

function readLine(line: LineDraft) {
  const fee = line.itemKind === 'fee'
  const qty = fee ? 1 : parseQty(line.quantityText)
  const typed = parseMoney(line.priceText)
  const unit = typed == null || Number.isNaN(typed) || !qty
    ? 0
    : !fee && line.priceMode === 'total'
      ? unitForTotal(typed, qty)
      : typed
  const weight = !fee && qty
    ? line.priceMode === 'total' && typed != null && !Number.isNaN(typed)
      ? typed
      : (qty || 0) * unit
    : 0
  return { qty, typed, unit, weight }
}

export function EntrySheet() {
  const { draft, closeDraft, entries, shops, customers, saveOrder, deleteEntry } = useShop()
  const [lines, setLines] = useState<LineDraft[]>(() => [blankLine()])
  const [shared, setShared] = useState<Shared>(() => blankShared())
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [finder, setFinder] = useState('')
  const [finderLine, setFinderLine] = useState<string | null>(null)
  const [game, setGame] = useState(() => localStorage.getItem('float.game') || 'pokemon')
  const [hits, setHits] = useState<CatalogProduct[]>([])
  const [finding, setFinding] = useState(false)
  const entriesRef = useRef(entries)
  const originalIds = useRef<string[]>([])
  entriesRef.current = entries

  useEffect(() => {
    setSaving(false)
    setError(null)
    setConfirmDelete(false)
    if (!draft) return
    setHits([])
    setFinder('')
    setFinderLine(null)
    if (draft.mode === 'edit') {
      const group = orderGroup(entriesRef.current, draft.entry)
      originalIds.current = group.map((entry) => entry.id)
      setLines(group.map((entry) => blankLine({ ...entry, attachedName: entry.productId ? entry.title : '' })))
      setShared(blankShared(draft.entry, group))
      return
    }
    originalIds.current = []
    if (draft.mode === 'sell') {
      const lot = positions(entriesRef.current).find((item) => item.buy.id === draft.buy.id)
      const remaining = lot && lot.remaining > 0 ? lot.remaining : 1
      setLines([blankLine({
        itemKind: draft.buy.itemKind,
        title: draft.buy.title,
        detail: draft.buy.detail,
        quantity: remaining,
        priceMode: 'total',
        productId: draft.buy.productId,
        subtype: draft.buy.subtype,
        boxesPerCase: draft.buy.boxesPerCase,
        attachedName: draft.buy.productId ? draft.buy.title : '',
      })])
      setShared(blankShared({ direction: 'in', lotId: draft.buy.id, occurredOn: todayISO(), shopId: null, customerId: null }))
      return
    }
    setLines([blankLine(draft.preset)])
    setShared(blankShared(draft.preset))
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
    if (!finderLine) return
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
  }, [finder, finderLine, game])

  const editing = draft?.mode === 'edit'
  const sellingBuy = draft?.mode === 'sell' ? draft.buy : null
  const purchase = shared.direction === 'out' && lines.every((line) => line.itemKind !== 'fee')

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

  function soldOf(id: string | undefined) {
    if (!id) return 0
    return entries.filter((entry) => entry.lotId === id).reduce((sum, entry) => sum + entry.quantity, 0)
  }

  function patchShared(partial: Partial<Shared>) {
    setShared((current) => ({ ...current, ...partial }))
  }

  function updateLine(key: string, partial: Partial<LineDraft>) {
    setLines((current) => current.map((line) => (line.key === key ? { ...line, ...partial } : line)))
  }

  function chooseKind(key: string, itemKind: ItemKind) {
    if (itemKind === 'fee' && lines.length > 1) {
      setError('A fee is its own entry. Remove the extra products first.')
      return
    }
    updateLine(key, itemKind === 'fee' ? { itemKind, quantityText: '1' } : { itemKind })
    if (itemKind === 'fee') patchShared({ direction: 'out' })
  }

  function chooseDirection(direction: Direction) {
    if (direction === 'in' && lines.length > 1) {
      setError('Several products in one order is money you spent. Remove the extra products first.')
      return
    }
    if (direction === 'in' && lines[0]?.itemKind === 'fee') {
      updateLine(lines[0].key, { itemKind: 'other' })
    }
    patchShared({ direction })
  }

  function switchPriceMode(key: string, next: 'each' | 'total') {
    setLines((current) => current.map((line) => {
      if (line.key !== key) return line
      const qty = parseQty(line.quantityText) || 1
      const amount = parseMoney(line.priceText)
      if (amount != null && !Number.isNaN(amount) && qty > 0) {
        const converted = next === 'total' ? roundMoney(amount * qty) : roundMoney(amount / qty)
        return { ...line, priceMode: next, priceText: String(converted) }
      }
      return { ...line, priceMode: next }
    }))
  }

  function addLine() {
    setLines((current) => [...current, blankLine()])
  }

  function removeLine(key: string) {
    const line = lines.find((item) => item.key === key)
    if (line?.id && soldOf(line.id) > 0) {
      setError('Delete the sales of that product before removing it from the order.')
      return
    }
    setLines((current) => current.filter((item) => item.key !== key))
    if (finderLine === key) setFinderLine(null)
  }

  function attach(key: string, hit: CatalogProduct) {
    const subtype = pickSubtype(hit.prices)
    setLines((current) => current.map((line) => {
      if (line.key !== key) return line
      return {
        ...line,
        productId: hit.productId,
        subtype,
        attachedName: hit.name,
        prices: hit.prices,
        title: line.title.trim() ? line.title : hit.number ? `${hit.name} ${hit.number}` : hit.name,
        detail: line.detail.trim() ? line.detail : hit.setName || '',
      }
    }))
    setFinderLine(null)
  }

  const reads = lines.map(readLine)
  const fees = lines.some((line) => line.itemKind === 'fee') ? null : parseMoney(shared.feesText)
  const feesNumber = fees && !Number.isNaN(fees) ? fees : 0
  const merchandise = reads.reduce((sum, item) => sum + ((item.qty || 0) * item.unit), 0)
  const first = lines[0]
  const firstRead = reads[0]
  const previewEntry: Entry = {
    id: 'preview',
    direction: first?.itemKind === 'fee' ? 'out' : shared.direction,
    itemKind: first?.itemKind || 'card',
    title: first?.title || '',
    detail: first?.detail || '',
    quantity: firstRead?.qty || 0,
    unitAmount: firstRead?.unit || 0,
    fees: first?.itemKind === 'fee' ? 0 : feesNumber,
    occurredOn: shared.occurredOn,
    notes: shared.notes,
    productId: first?.productId ?? null,
    subtype: first?.subtype ?? null,
    boxesPerCase: first?.itemKind === 'case' ? Number(first.boxesText) || 6 : null,
    lotId: shared.lotId,
    shopId: shared.shopId,
    customerId: shared.customerId,
    trackingNumber: shared.trackingNumber || null,
    trackingCarrier: shared.trackingCarrier || null,
    arrivesOn: shared.arrivesOn || null,
    orderId: shared.orderId,
    expectEach: null,
    createdAt: '',
  }
  const previewCash = lines.length > 1 ? roundMoney(merchandise + feesNumber) : firstRead?.qty ? lineCash(previewEntry) : 0
  const sentence = lines.length > 1
    ? `Spent ${money(previewCash)} on ${lines.length} products${feesNumber ? `, including ${money(feesNumber)} shipping and tax` : ''}.`
    : describe(previewEntry, previewCash)

  async function onSave() {
    setError(null)
    if (fees != null && Number.isNaN(fees)) {
      setError('Fees should be a dollar amount.')
      return
    }
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index]
      const parsed = reads[index]
      if (!line.title.trim()) {
        setError(lines.length > 1 ? `Name product ${index + 1}.` : 'Name the card, case, or fee.')
        return
      }
      if (!parsed.qty) {
        setError('Enter a quantity greater than zero.')
        return
      }
      if (parsed.typed == null || Number.isNaN(parsed.typed)) {
        setError('Enter the price.')
        return
      }
      if (line.id) {
        const sold = soldOf(line.id)
        if ((parsed.qty || 0) + 0.0001 < sold) {
          setError(`You already sold ${sold} of ${line.title}. Quantity can't go below that.`)
          return
        }
      }
      if (shared.lotId && maxQty != null && (parsed.qty || 0) > maxQty + 0.0001) {
        setError(`Only ${maxQty} left on that purchase.`)
        return
      }
    }
    const orderId = lines.length > 1 && purchase ? shared.orderId || crypto.randomUUID() : null
    const shares = lines.length > 1 && purchase ? allocateFees(reads.map((item) => item.weight), feesNumber) : null
    const items = lines.map((line, index) => {
      const parsed = reads[index]
      const feeLine = line.itemKind === 'fee'
      const input: EntryInput = {
        direction: feeLine ? 'out' : shared.direction,
        itemKind: line.itemKind,
        title: line.title.trim(),
        detail: feeLine ? '' : line.detail.trim(),
        quantity: feeLine ? 1 : parsed.qty || 0,
        unitAmount: parsed.unit,
        fees: feeLine ? 0 : shares ? shares[index] : feesNumber,
        occurredOn: shared.occurredOn,
        notes: shared.notes,
        productId: feeLine ? null : line.productId,
        subtype: feeLine ? null : line.subtype,
        boxesPerCase: line.itemKind === 'case' ? Math.max(1, Number(line.boxesText) || 6) : null,
        lotId: shared.lotId,
        shopId: shared.direction === 'out' && !feeLine ? shared.shopId : null,
        customerId: shared.direction === 'in' && !feeLine ? shared.customerId : null,
        trackingNumber: shared.direction === 'out' ? shared.trackingNumber.trim() || null : null,
        trackingCarrier: shared.direction === 'out' && shared.trackingNumber.trim() ? shared.trackingCarrier || 'other' : null,
        arrivesOn: shared.direction === 'out' && !feeLine && /^\d{4}-\d{2}-\d{2}$/.test(shared.arrivesOn) ? shared.arrivesOn : null,
        orderId,
        expectEach: !feeLine && line.id ? (entries.find((item) => item.id === line.id)?.expectEach ?? null) : null,
      }
      return { input, id: line.id }
    })
    const removeIds = originalIds.current.filter((id) => !lines.some((line) => line.id === id))
    for (const id of removeIds) {
      if (soldOf(id) > 0) {
        setError('Delete the sales of a product before removing it from the order.')
        return
      }
    }
    setSaving(true)
    try {
      await Promise.race([
        saveOrder(items, removeIds),
        new Promise<never>((_, reject) => {
          window.setTimeout(() => reject(new Error('Saving is taking too long. Check your connection and try again.')), 15000)
        }),
      ])
      closeDraft()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save that entry.')
    } finally {
      setSaving(false)
    }
  }

  async function onDelete() {
    const ids = lines.map((line) => line.id).filter((id): id is string => Boolean(id))
    if (!ids.length) return
    for (const id of ids) {
      if (soldOf(id) > 0) {
        setError('This purchase still has a sale. Delete that sale first, then you can remove the purchase.')
        return
      }
    }
    setSaving(true)
    try {
      for (const id of ids) {
        await Promise.race([
          deleteEntry(id),
          new Promise<never>((_, reject) => {
            window.setTimeout(() => reject(new Error('Deleting is taking too long. Check your connection and try again.')), 15000)
          }),
        ])
      }
      closeDraft()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete that entry.')
      setSaving(false)
    }
  }

  const heading = draft.mode === 'sell' ? 'Record a sale' : editing && lines.length > 1 ? 'Edit order' : editing ? 'Edit entry' : 'Add to the books'
  const canAdd = purchase && draft.mode !== 'sell'

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
          <p className="quiet">Selling from {sellingBuy.title}. {maxQty == null ? '' : `${maxQty} still on hand. The quantity starts at all of them.`}</p>
        ) : (
          <div className="seg" role="group" aria-label="Money direction">
            <button type="button" aria-pressed={shared.direction === 'out'} onClick={() => chooseDirection('out')}>Spent</button>
            <button type="button" aria-pressed={shared.direction === 'in'} onClick={() => chooseDirection('in')}>Made</button>
          </div>
        )}
        {lines.map((line, index) => {
          const selectedPrice = line.prices.find((price) => price.subtype === line.subtype)
          const kinds = lines.length > 1 ? KINDS.filter((kind) => kind.id !== 'fee') : KINDS
          return (
            <div key={line.key} className={lines.length > 1 ? 'order-line' : undefined}>
              {lines.length > 1 ? (
                <header>
                  <p>Product {index + 1}</p>
                  <button type="button" className="text-btn" onClick={() => removeLine(line.key)}>Remove</button>
                </header>
              ) : null}
              {draft.mode !== 'sell' ? (
                <div className="kind-grid" role="group" aria-label={lines.length > 1 ? `What product ${index + 1} is` : 'What this is'}>
                  {kinds.map((kind) => (
                    <button key={kind.id} type="button" className="chip" aria-pressed={line.itemKind === kind.id} onClick={() => chooseKind(line.key, kind.id)}>
                      {kind.label}
                    </button>
                  ))}
                </div>
              ) : null}
              <label className="field">
                Name
                <input
                  value={line.title}
                  onChange={(event) => updateLine(line.key, { title: event.target.value })}
                  placeholder={PLACEHOLDER[line.itemKind]}
                  autoComplete="off"
                  maxLength={180}
                />
              </label>
              {line.itemKind !== 'fee' ? (
                <label className="field">
                  Details
                  <input
                    value={line.detail}
                    onChange={(event) => updateLine(line.key, { detail: event.target.value })}
                    placeholder="Set, condition, or where it came from"
                    autoComplete="off"
                  />
                </label>
              ) : null}
              {line.itemKind === 'case' ? (
                <label className="field">
                  Boxes in the case
                  <input
                    inputMode="numeric"
                    value={line.boxesText}
                    onChange={(event) => updateLine(line.key, { boxesText: event.target.value.replace(/[^\d]/g, '') })}
                  />
                </label>
              ) : null}
              {line.itemKind !== 'fee' ? (
                <div className="split-fields">
                  <label className="field">
                    Quantity
                    <input inputMode="decimal" value={line.quantityText} onChange={(event) => updateLine(line.key, { quantityText: event.target.value })} />
                  </label>
                  <label className="field">
                    {line.priceMode === 'total' ? (draft.mode === 'sell' ? 'Total you got' : 'Total price') : 'Price each'}
                    <input inputMode="decimal" value={line.priceText} onChange={(event) => updateLine(line.key, { priceText: event.target.value })} placeholder="0.00" />
                  </label>
                </div>
              ) : (
                <label className="field">
                  Amount
                  <input inputMode="decimal" value={line.priceText} onChange={(event) => updateLine(line.key, { priceText: event.target.value })} placeholder="0.00" />
                </label>
              )}
              {line.itemKind !== 'fee' ? (
                <div className="seg slim" role="group" aria-label="Price is each or total">
                  <button type="button" aria-pressed={line.priceMode === 'each'} onClick={() => switchPriceMode(line.key, 'each')}>Each</button>
                  <button type="button" aria-pressed={line.priceMode === 'total'} onClick={() => switchPriceMode(line.key, 'total')}>Total</button>
                </div>
              ) : null}
              {draft.mode === 'sell' && line.itemKind !== 'fee' && line.priceMode === 'total' ? (
                <span className="field-hint">One number for this whole sale. The pieces can have sold for different prices.</span>
              ) : null}
              {draft.mode !== 'sell' && line.itemKind !== 'fee' ? (
                <div className="attach">
                  {line.productId ? (
                    <div className="attached">
                      <div>
                        <strong>{line.attachedName || 'TCGplayer listing'}</strong>
                        <span>{line.subtype}{selectedPrice?.market != null ? ` · market ${money(selectedPrice.market)}` : ''}</span>
                      </div>
                      <button
                        type="button"
                        className="btn ghost"
                        onClick={() => updateLine(line.key, { productId: null, subtype: null, attachedName: '', prices: [] })}
                      >
                        Remove
                      </button>
                    </div>
                  ) : (
                    <button type="button" className="btn ghost" onClick={() => setFinderLine((open) => (open === line.key ? null : line.key))}>
                      {finderLine === line.key ? 'Hide TCGplayer search' : 'Attach a TCGplayer price'}
                    </button>
                  )}
                  {line.prices.length > 1 && line.productId ? (
                    <label className="field">
                      Printing
                      <select value={line.subtype || ''} onChange={(event) => updateLine(line.key, { subtype: event.target.value })}>
                        {line.prices.map((price) => (
                          <option key={price.subtype} value={price.subtype}>
                            {price.subtype}{price.market != null ? ` · ${money(price.market)}` : ''}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : null}
                  {finderLine === line.key && !line.productId ? (
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
                          <button key={`${line.key}-${hit.productId}`} type="button" className="mini-result" onClick={() => attach(line.key, hit)}>
                            <span>{hit.name}</span>
                            <small>{hit.setName}{hit.sealed ? ' · sealed' : ''}</small>
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  {lines.length === 1 ? <p className="quiet">Optional. Attach a listing and Stock can compare what you paid with the market.</p> : null}
                </div>
              ) : null}
            </div>
          )
        })}
        {canAdd ? (
          <button type="button" className="btn ghost wide add-line" onClick={addLine}>Add another product</button>
        ) : null}
        {purchase ? (
          <label className="field">
            Extra fees
            <input inputMode="decimal" value={shared.feesText} onChange={(event) => patchShared({ feesText: event.target.value })} placeholder="Shipping, tax, platform" />
            {lines.length > 1 ? <span className="field-hint">Shipping and tax for this whole order. Enter it once.</span> : null}
          </label>
        ) : lines.length === 1 && lines[0].itemKind !== 'fee' ? (
          <label className="field">
            Fees taken out
            <input inputMode="decimal" value={shared.feesText} onChange={(event) => patchShared({ feesText: event.target.value })} placeholder="Shipping, tax, platform" />
          </label>
        ) : null}
        <label className="field">
          Date
          <input type="date" value={shared.occurredOn} onChange={(event) => patchShared({ occurredOn: event.target.value })} />
        </label>
        {purchase ? (
          <label className="field">
            Arrives
            <input type="date" value={shared.arrivesOn} onChange={(event) => patchShared({ arrivesOn: event.target.value })} />
            <span className="field-hint">Release day, or the day you expect the package.</span>
          </label>
        ) : null}
        {shared.direction === 'out' ? (
          <div className="split-fields">
            <label className="field">
              Tracking number
              <input
                value={shared.trackingNumber}
                onChange={(event) => {
                  const trackingNumber = event.target.value
                  patchShared({
                    trackingNumber,
                    trackingCarrier: shared.trackingCarrier || (trackingNumber.trim() ? guessCarrier(trackingNumber) : ''),
                  })
                }}
                placeholder="Optional"
                autoComplete="off"
                autoCapitalize="characters"
              />
            </label>
            <label className="field">
              Carrier
              <select value={shared.trackingCarrier} onChange={(event) => patchShared({ trackingCarrier: event.target.value })}>
                <option value="">Choose</option>
                {CARRIERS.map((carrier) => (
                  <option key={carrier.id} value={carrier.id}>{carrier.label}</option>
                ))}
              </select>
            </label>
          </div>
        ) : null}
        {purchase ? (
          <label className="field">
            Store
            <select value={shared.shopId || ''} onChange={(event) => patchShared({ shopId: event.target.value || null })}>
              <option value="">Not linked</option>
              {shops.map((shop) => (
                <option key={shop.id} value={shop.id}>{shop.name}</option>
              ))}
            </select>
          </label>
        ) : null}
        {shared.direction === 'in' ? (
          <label className="field">
            Customer
            <select value={shared.customerId || ''} onChange={(event) => patchShared({ customerId: event.target.value || null })}>
              <option value="">Not linked</option>
              {customers.map((customer) => (
                <option key={customer.id} value={customer.id}>{customer.name}</option>
              ))}
            </select>
            {customers.length === 0 ? <span className="field-hint">Add a customer on People, then pick them on the next sale.</span> : null}
          </label>
        ) : null}
        <label className="field">
          Note
          <textarea value={shared.notes} onChange={(event) => patchShared({ notes: event.target.value })} rows={2} placeholder="Optional" />
        </label>
        <p className="preview-line" aria-live="polite">{sentence}</p>
        {error ? <p className="error-text">{error}</p> : null}
        <button type="button" className="btn wide" onClick={onSave} disabled={saving}>
          {saving ? 'Saving…' : draft.mode === 'sell' ? 'Save sale' : lines.length > 1 ? 'Save order' : 'Save entry'}
        </button>
        {editing ? (
          confirmDelete ? (
            <div className="confirm-row">
              <span>{lines.length > 1 ? 'Delete this order?' : 'Delete this entry?'}</span>
              <button type="button" className="btn danger" onClick={onDelete} disabled={saving}>{saving ? 'Deleting…' : 'Delete'}</button>
              <button type="button" className="btn ghost" onClick={() => setConfirmDelete(false)}>Keep</button>
            </div>
          ) : (
            <button type="button" className="btn ghost wide" onClick={() => setConfirmDelete(true)}>
              {lines.length > 1 ? 'Delete this order' : 'Delete entry'}
            </button>
          )
        ) : null}
      </div>
    </div>
  )
}

function orderGroup(entries: Entry[], entry: Entry) {
  if (!entry.orderId || entry.direction !== 'out' || entry.lotId) return [entry]
  const group = entries.filter((item) => item.orderId === entry.orderId && item.direction === 'out' && !item.lotId)
  if (!group.length) return [entry]
  return [...group].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
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
