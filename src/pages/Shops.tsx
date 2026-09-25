import { useMemo, useState } from 'react'
import { prettyDate } from '../lib/format.ts'
import type { Shop, ShopAgain, ShopLegit, ShopQuality, ShopShipping } from '../lib/rows.ts'
import { useShop } from '../store.tsx'

const SHIPPING: { id: ShopShipping; label: string }[] = [
  { id: 'fast', label: 'Fast' },
  { id: 'ok', label: 'Okay' },
  { id: 'slow', label: 'Slow' },
  { id: 'waiting', label: 'Not in yet' },
]
const QUALITY: { id: ShopQuality; label: string }[] = [
  { id: 'great', label: 'Great' },
  { id: 'ok', label: 'As described' },
  { id: 'poor', label: 'Worse' },
  { id: 'unchecked', label: 'Not checked' },
]
const LEGIT: { id: ShopLegit; label: string }[] = [
  { id: 'yes', label: 'Legitimate' },
  { id: 'unsure', label: 'Not sure' },
  { id: 'no', label: 'Seemed fake' },
]
const AGAIN: { id: ShopAgain; label: string }[] = [
  { id: 'yes', label: 'Yes' },
  { id: 'maybe', label: 'Maybe' },
  { id: 'no', label: 'No' },
]

type Draft = Omit<Shop, 'id' | 'createdAt' | 'updatedAt'>

const EMPTY: Draft = {
  name: '',
  whereFrom: '',
  shipping: 'waiting',
  quality: 'unchecked',
  legit: 'unsure',
  again: 'maybe',
  notes: '',
}

function labelOf<T extends string>(options: { id: T; label: string }[], id: T) {
  return options.find((option) => option.id === id)?.label || id
}

function againRank(again: ShopAgain) {
  if (again === 'yes') return 0
  if (again === 'maybe') return 1
  return 2
}

export function ShopsPage() {
  const { shops, entries, saveShop, deleteShop } = useShop()
  const [filter, setFilter] = useState<'all' | 'yes' | 'no'>('all')
  const [editing, setEditing] = useState<Shop | null | 'new'>(null)
  const [form, setForm] = useState<Draft>(EMPTY)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const visible = useMemo(() => {
    return shops
      .filter((shop) => filter === 'all' || shop.again === filter)
      .slice()
      .sort((a, b) => againRank(a.again) - againRank(b.again) || a.name.localeCompare(b.name))
  }, [shops, filter])

  function openNew() {
    setForm(EMPTY)
    setEditing('new')
    setError(null)
    setConfirmDelete(false)
  }

  function openShop(shop: Shop) {
    setForm({
      name: shop.name,
      whereFrom: shop.whereFrom,
      shipping: shop.shipping,
      quality: shop.quality,
      legit: shop.legit,
      again: shop.again,
      notes: shop.notes,
    })
    setEditing(shop)
    setError(null)
    setConfirmDelete(false)
  }

  function close() {
    setEditing(null)
    setError(null)
  }

  async function onSave() {
    if (!form.name.trim()) {
      setError('Name the store.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await saveShop(form, editing && editing !== 'new' ? editing.id : undefined)
      close()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save that store.')
    } finally {
      setSaving(false)
    }
  }

  async function onDelete() {
    if (!editing || editing === 'new') return
    setSaving(true)
    try {
      await deleteShop(editing.id)
      close()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete that store.')
      setSaving(false)
    }
  }

  return (
    <section>
      <header className="page-head">
        <div>
          <p className="kicker">Sellers</p>
          <h1>Shops</h1>
        </div>
        <button type="button" className="icon-btn" aria-label="Add a store" onClick={openNew}>+</button>
      </header>
      <p className="quiet">Remember who shipped fast, sent a real card, and is worth buying from again.</p>
      <div className="seg slim" role="group" aria-label="Which stores">
        <button type="button" aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>All</button>
        <button type="button" aria-pressed={filter === 'yes'} onClick={() => setFilter('yes')}>Buy again</button>
        <button type="button" aria-pressed={filter === 'no'} onClick={() => setFilter('no')}>Skip</button>
      </div>
      {visible.length === 0 ? (
        <div className="empty">
          <p>{shops.length === 0 ? 'No stores yet.' : 'Nothing in this group.'}</p>
          <p>Add a shop after an order and mark the shipping, the card, and whether it was legitimate.</p>
          <button type="button" className="btn" onClick={openNew}>Add a store</button>
        </div>
      ) : (
        <div className="ledger">
          {visible.map((shop) => {
            const bought = entries.filter((entry) => entry.shopId === shop.id && entry.direction === 'out')
            return (
              <button key={shop.id} type="button" className="shop-row" onClick={() => openShop(shop)}>
                <span className="row-title">{shop.name}</span>
                <span className="row-sub">
                  {[shop.whereFrom, `Ship ${labelOf(SHIPPING, shop.shipping).toLowerCase()}`, `Quality ${labelOf(QUALITY, shop.quality).toLowerCase()}`, labelOf(LEGIT, shop.legit)].filter(Boolean).join(' · ')}
                </span>
                <span className={`shop-again again-${shop.again}`}>
                  {shop.again === 'yes' ? 'Buy again' : shop.again === 'no' ? 'Skip next time' : 'Maybe again'}
                </span>
                {bought.length > 0 ? (
                  <span className="row-sub">{bought.length} purchase{bought.length === 1 ? '' : 's'} · {bought[0].title}</span>
                ) : null}
              </button>
            )
          })}
        </div>
      )}
      {editing ? (
        <div className="backdrop" onMouseDown={close}>
          <div className="sheet" role="dialog" aria-modal="true" aria-labelledby="shop-title" onMouseDown={(event) => event.stopPropagation()}>
            <div className="grab" aria-hidden="true" />
            <div className="sheet-head">
              <h2 id="shop-title">{editing === 'new' ? 'Add a store' : 'Edit store'}</h2>
              <button type="button" className="btn ghost" onClick={close}>Close</button>
            </div>
            <label className="field">
              Store name
              <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Seller or shop name" maxLength={120} autoComplete="off" />
            </label>
            <label className="field">
              Where
              <input value={form.whereFrom} onChange={(event) => setForm({ ...form, whereFrom: event.target.value })} placeholder="TCGPlayer, eBay, a card show" autoComplete="off" />
            </label>
            <Choice label="How fast did it ship?" options={SHIPPING} value={form.shipping} onChange={(shipping) => setForm({ ...form, shipping })} />
            <Choice label="Quality of the card" options={QUALITY} value={form.quality} onChange={(quality) => setForm({ ...form, quality })} />
            <Choice label="Did it seem legitimate?" options={LEGIT} value={form.legit} onChange={(legit) => setForm({ ...form, legit })} />
            <Choice label="Buy from them again?" options={AGAIN} value={form.again} onChange={(again) => setForm({ ...form, again })} />
            <label className="field">
              Notes
              <textarea value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} rows={3} placeholder="Packed well, slow scan, off-center, and so on" />
            </label>
            {editing !== 'new' ? (
              <ShopOrders shopId={editing.id} />
            ) : null}
            {error ? <p className="error-text">{error}</p> : null}
            <button type="button" className="btn wide" onClick={onSave} disabled={saving}>{saving ? 'Saving…' : 'Save store'}</button>
            {editing !== 'new' ? (
              confirmDelete ? (
                <div className="confirm-row">
                  <span>Delete this store?</span>
                  <button type="button" className="btn danger" onClick={onDelete} disabled={saving}>Delete</button>
                  <button type="button" className="btn ghost" onClick={() => setConfirmDelete(false)}>Keep</button>
                </div>
              ) : (
                <button type="button" className="btn ghost wide" onClick={() => setConfirmDelete(true)}>Delete store</button>
              )
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  )
}

function Choice<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string
  options: { id: T; label: string }[]
  value: T
  onChange: (value: T) => void
}) {
  return (
    <fieldset className="choice">
      <legend>{label}</legend>
      <div className="kind-grid">
        {options.map((option) => (
          <button key={option.id} type="button" className="chip" aria-pressed={value === option.id} onClick={() => onChange(option.id)}>
            {option.label}
          </button>
        ))}
      </div>
    </fieldset>
  )
}

function ShopOrders({ shopId }: { shopId: string }) {
  const { entries } = useShop()
  const bought = entries.filter((entry) => entry.shopId === shopId && entry.direction === 'out')
  if (!bought.length) return <p className="quiet">No purchases linked yet. Pick this store when you log a buy.</p>
  return (
    <div className="ledger">
      {bought.map((entry) => (
        <p key={entry.id} className="row-sub shop-order">{prettyDate(entry.occurredOn)} · {entry.title}</p>
      ))}
    </div>
  )
}
