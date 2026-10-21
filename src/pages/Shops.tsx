import { useMemo, useState } from 'react'
import { lineCash, type Entry } from '../lib/books.ts'
import { money, prettyDate } from '../lib/format.ts'
import { entryFields, type Customer, type Shop, type ShopAgain, type ShopLegit, type ShopQuality, type ShopShipping } from '../lib/rows.ts'
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
const RETURNING: { id: 'yes' | 'no'; label: string }[] = [
  { id: 'no', label: 'Not yet' },
  { id: 'yes', label: 'Comes back' },
]

type StoreDraft = Omit<Shop, 'id' | 'createdAt' | 'updatedAt'>
type CustomerDraft = Omit<Customer, 'id' | 'createdAt' | 'updatedAt'>

const EMPTY_STORE: StoreDraft = {
  name: '',
  whereFrom: '',
  shipping: 'waiting',
  quality: 'unchecked',
  legit: 'unsure',
  again: 'maybe',
  notes: '',
}

const EMPTY_CUSTOMER: CustomerDraft = {
  name: '',
  notes: '',
  regular: false,
}

function labelOf<T extends string>(options: { id: T; label: string }[], id: T) {
  return options.find((option) => option.id === id)?.label || id
}

function againRank(again: ShopAgain) {
  if (again === 'yes') return 0
  if (again === 'maybe') return 1
  return 2
}

function buyerSales(entries: Entry[], customerId?: string) {
  return entries.filter((entry) =>
    entry.direction === 'in'
    && entry.itemKind !== 'fee'
    && (customerId ? entry.customerId === customerId : !entry.customerId))
}

function comesBack(regular: boolean, sales: number) {
  return regular || sales >= 2
}

export function ShopsPage() {
  const { shops, customers, entries, saveShop, deleteShop, saveCustomer, deleteCustomer, saveEntry } = useShop()
  const [section, setSection] = useState<'stores' | 'customers'>('stores')
  const [storeFilter, setStoreFilter] = useState<'all' | 'yes' | 'no'>('all')
  const [customerFilter, setCustomerFilter] = useState<'all' | 'back' | 'fresh'>('all')
  const [storeQuery, setStoreQuery] = useState('')
  const [customerQuery, setCustomerQuery] = useState('')
  const [editingStore, setEditingStore] = useState<Shop | 'new' | null>(null)
  const [editingCustomer, setEditingCustomer] = useState<Customer | 'new' | null>(null)
  const [storeForm, setStoreForm] = useState<StoreDraft>(EMPTY_STORE)
  const [customerForm, setCustomerForm] = useState<CustomerDraft>(EMPTY_CUSTOMER)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const visibleStores = useMemo(() => {
    const needle = storeQuery.trim().toLowerCase()
    return shops
      .filter((shop) => storeFilter === 'all' || shop.again === storeFilter)
      .filter((shop) => {
        if (!needle) return true
        return `${shop.name} ${shop.whereFrom} ${shop.notes}`.toLowerCase().includes(needle)
      })
      .slice()
      .sort((a, b) => againRank(a.again) - againRank(b.again) || a.name.localeCompare(b.name))
  }, [shops, storeFilter, storeQuery])

  const visibleCustomers = useMemo(() => {
    const needle = customerQuery.trim().toLowerCase()
    return customers
      .filter((customer) => {
        const back = comesBack(customer.regular, buyerSales(entries, customer.id).length)
        if (customerFilter === 'back') return back
        if (customerFilter === 'fresh') return !back
        return true
      })
      .filter((customer) => {
        if (!needle) return true
        return `${customer.name} ${customer.notes}`.toLowerCase().includes(needle)
      })
      .slice()
      .sort((a, b) => {
        const back = Number(comesBack(b.regular, buyerSales(entries, b.id).length)) - Number(comesBack(a.regular, buyerSales(entries, a.id).length))
        return back || a.name.localeCompare(b.name)
      })
  }, [customers, entries, customerFilter, customerQuery])

  function showSection(next: 'stores' | 'customers') {
    setSection(next)
    setEditingStore(null)
    setEditingCustomer(null)
    setError(null)
    setConfirmDelete(false)
  }

  function openNew() {
    setError(null)
    setConfirmDelete(false)
    if (section === 'stores') {
      setStoreForm(EMPTY_STORE)
      setEditingStore('new')
      return
    }
    setCustomerForm(EMPTY_CUSTOMER)
    setEditingCustomer('new')
  }

  function openStore(shop: Shop) {
    setStoreForm({
      name: shop.name,
      whereFrom: shop.whereFrom,
      shipping: shop.shipping,
      quality: shop.quality,
      legit: shop.legit,
      again: shop.again,
      notes: shop.notes,
    })
    setEditingStore(shop)
    setError(null)
    setConfirmDelete(false)
  }

  function openCustomer(customer: Customer) {
    setCustomerForm({
      name: customer.name,
      notes: customer.notes,
      regular: customer.regular,
    })
    setEditingCustomer(customer)
    setError(null)
    setConfirmDelete(false)
  }

  function close() {
    setEditingStore(null)
    setEditingCustomer(null)
    setError(null)
  }

  async function onSaveStore() {
    if (!storeForm.name.trim()) {
      setError('Name the store.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await saveShop(storeForm, editingStore && editingStore !== 'new' ? editingStore.id : undefined)
      close()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save that store.')
    } finally {
      setSaving(false)
    }
  }

  async function onDeleteStore() {
    if (!editingStore || editingStore === 'new') return
    setSaving(true)
    try {
      await deleteShop(editingStore.id)
      close()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete that store.')
      setSaving(false)
    }
  }

  async function onSaveCustomer() {
    if (!customerForm.name.trim()) {
      setError('Name the customer.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await saveCustomer(customerForm, editingCustomer && editingCustomer !== 'new' ? editingCustomer.id : undefined)
      close()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save that customer.')
    } finally {
      setSaving(false)
    }
  }

  async function onDeleteCustomer() {
    if (!editingCustomer || editingCustomer === 'new') return
    setSaving(true)
    try {
      await deleteCustomer(editingCustomer.id)
      close()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete that customer.')
      setSaving(false)
    }
  }

  async function linkSale(entry: Entry, customerId: string | null) {
    setSaving(true)
    setError(null)
    try {
      await saveEntry({ ...entryFields(entry), customerId }, entry.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update that sale.')
    } finally {
      setSaving(false)
    }
  }

  const openSales = buyerSales(entries)

  return (
    <section>
      <header className="page-head">
        <div>
          <p className="kicker">Buyers and sellers</p>
          <h1>People</h1>
        </div>
        <button
          type="button"
          className="icon-btn"
          aria-label={section === 'stores' ? 'Add a store' : 'Add a customer'}
          onClick={openNew}
        >+</button>
      </header>
      <div className="seg" role="group" aria-label="Stores or customers">
        <button type="button" aria-pressed={section === 'stores'} onClick={() => showSection('stores')}>Stores</button>
        <button type="button" aria-pressed={section === 'customers'} onClick={() => showSection('customers')}>Customers</button>
      </div>
      {section === 'stores' ? (
        <>
          <p className="quiet">Remember who shipped fast, sent a real card, and is worth buying from again.</p>
          <label className="field search-field">
            <span className="sr-only">Search stores</span>
            <input
              value={storeQuery}
              onChange={(event) => setStoreQuery(event.target.value)}
              placeholder="Search stores"
              autoComplete="off"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="search"
            />
          </label>
          <div className="seg slim" role="group" aria-label="Which stores">
            <button type="button" aria-pressed={storeFilter === 'all'} onClick={() => setStoreFilter('all')}>All</button>
            <button type="button" aria-pressed={storeFilter === 'yes'} onClick={() => setStoreFilter('yes')}>Buy again</button>
            <button type="button" aria-pressed={storeFilter === 'no'} onClick={() => setStoreFilter('no')}>Skip</button>
          </div>
          {visibleStores.length === 0 ? (
            shops.length === 0 ? (
              <div className="empty">
                <p>No stores yet.</p>
                <p>Add a shop after an order and mark the shipping, the card, and whether it was legitimate.</p>
                <button type="button" className="btn" onClick={openNew}>Add a store</button>
              </div>
            ) : (
              <p className="quiet">{storeQuery.trim() ? 'No stores match that search.' : 'Nothing in this group.'}</p>
            )
          ) : (
            <div className="ledger">
              {visibleStores.map((shop) => {
                const bought = entries.filter((entry) => entry.shopId === shop.id && entry.direction === 'out')
                return (
                  <button key={shop.id} type="button" className="shop-row" onClick={() => openStore(shop)}>
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
        </>
      ) : (
        <>
          <p className="quiet">Remember who you sold to. Someone who comes back is marked here, including a regular you name before the second sale.</p>
          <label className="field search-field">
            <span className="sr-only">Search customers</span>
            <input
              value={customerQuery}
              onChange={(event) => setCustomerQuery(event.target.value)}
              placeholder="Search customers"
              autoComplete="off"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="search"
            />
          </label>
          <div className="seg slim" role="group" aria-label="Which customers">
            <button type="button" aria-pressed={customerFilter === 'all'} onClick={() => setCustomerFilter('all')}>All</button>
            <button type="button" aria-pressed={customerFilter === 'back'} onClick={() => setCustomerFilter('back')}>Comes back</button>
            <button type="button" aria-pressed={customerFilter === 'fresh'} onClick={() => setCustomerFilter('fresh')}>Not yet</button>
          </div>
          {visibleCustomers.length === 0 ? (
            customers.length === 0 ? (
              <div className="empty">
                <p>No customers yet.</p>
                <p>Add someone you sold to, or pick them when you log a sale.</p>
                <button type="button" className="btn" onClick={openNew}>Add a customer</button>
              </div>
            ) : (
              <p className="quiet">{customerQuery.trim() ? 'No customers match that search.' : 'Nothing in this group.'}</p>
            )
          ) : (
            <div className="ledger">
              {visibleCustomers.map((customer) => {
                const sales = buyerSales(entries, customer.id)
                const back = comesBack(customer.regular, sales.length)
                return (
                  <button key={customer.id} type="button" className="shop-row" onClick={() => openCustomer(customer)}>
                    <span className="row-title">{customer.name}</span>
                    {customer.notes ? <span className="row-sub">{customer.notes}</span> : null}
                    <span className={`shop-again ${back ? 'again-yes' : 'again-maybe'}`}>
                      {back ? 'Comes back' : 'Not yet'}
                    </span>
                    <span className="row-sub">
                      {sales.length === 0
                        ? 'No sales linked yet'
                        : `${sales.length} sale${sales.length === 1 ? '' : 's'} · ${sales[0].title}`}
                    </span>
                  </button>
                )
              })}
            </div>
          )}
        </>
      )}
      {editingStore ? (
        <div className="backdrop" onMouseDown={close}>
          <div className="sheet" role="dialog" aria-modal="true" aria-labelledby="shop-title" onMouseDown={(event) => event.stopPropagation()}>
            <div className="grab" aria-hidden="true" />
            <div className="sheet-head">
              <h2 id="shop-title">{editingStore === 'new' ? 'Add a store' : 'Edit store'}</h2>
              <button type="button" className="btn ghost" onClick={close}>Close</button>
            </div>
            <label className="field">
              Store name
              <input value={storeForm.name} onChange={(event) => setStoreForm({ ...storeForm, name: event.target.value })} placeholder="Seller or shop name" maxLength={120} autoComplete="off" />
            </label>
            <label className="field">
              Where
              <input value={storeForm.whereFrom} onChange={(event) => setStoreForm({ ...storeForm, whereFrom: event.target.value })} placeholder="TCGPlayer, eBay, a card show" autoComplete="off" />
            </label>
            <Choice label="How fast did it ship?" options={SHIPPING} value={storeForm.shipping} onChange={(shipping) => setStoreForm({ ...storeForm, shipping })} />
            <Choice label="Quality of the card" options={QUALITY} value={storeForm.quality} onChange={(quality) => setStoreForm({ ...storeForm, quality })} />
            <Choice label="Did it seem legitimate?" options={LEGIT} value={storeForm.legit} onChange={(legit) => setStoreForm({ ...storeForm, legit })} />
            <Choice label="Buy from them again?" options={AGAIN} value={storeForm.again} onChange={(again) => setStoreForm({ ...storeForm, again })} />
            <label className="field">
              Notes
              <textarea value={storeForm.notes} onChange={(event) => setStoreForm({ ...storeForm, notes: event.target.value })} rows={3} placeholder="Packed well, slow scan, off-center, and so on" />
            </label>
            {editingStore !== 'new' ? <ShopOrders shopId={editingStore.id} /> : null}
            {error ? <p className="error-text">{error}</p> : null}
            <button type="button" className="btn wide" onClick={onSaveStore} disabled={saving}>{saving ? 'Saving…' : 'Save store'}</button>
            {editingStore !== 'new' ? (
              confirmDelete ? (
                <div className="confirm-row">
                  <span>Delete this store?</span>
                  <button type="button" className="btn danger" onClick={onDeleteStore} disabled={saving}>Delete</button>
                  <button type="button" className="btn ghost" onClick={() => setConfirmDelete(false)}>Keep</button>
                </div>
              ) : (
                <button type="button" className="btn ghost wide" onClick={() => setConfirmDelete(true)}>Delete store</button>
              )
            ) : null}
          </div>
        </div>
      ) : null}
      {editingCustomer ? (
        <div className="backdrop" onMouseDown={close}>
          <div className="sheet" role="dialog" aria-modal="true" aria-labelledby="customer-title" onMouseDown={(event) => event.stopPropagation()}>
            <div className="grab" aria-hidden="true" />
            <div className="sheet-head">
              <h2 id="customer-title">{editingCustomer === 'new' ? 'Add a customer' : 'Edit customer'}</h2>
              <button type="button" className="btn ghost" onClick={close}>Close</button>
            </div>
            <label className="field">
              Name
              <input value={customerForm.name} onChange={(event) => setCustomerForm({ ...customerForm, name: event.target.value })} placeholder="Who you sold to" maxLength={120} autoComplete="off" />
            </label>
            <label className="field">
              Notes
              <textarea value={customerForm.notes} onChange={(event) => setCustomerForm({ ...customerForm, notes: event.target.value })} rows={3} placeholder="Pays cash, wants Radiance, and so on" />
            </label>
            <Choice
              label="Do they come back?"
              options={RETURNING}
              value={customerForm.regular ? 'yes' : 'no'}
              onChange={(value) => setCustomerForm({ ...customerForm, regular: value === 'yes' })}
            />
            <p className="field-hint">Two linked sales also count, even if this stays on Not yet.</p>
            {editingCustomer !== 'new' ? (
              <CustomerSales
                customerId={editingCustomer.id}
                sales={buyerSales(entries, editingCustomer.id)}
                openSales={openSales}
                saving={saving}
                onLink={linkSale}
              />
            ) : (
              <p className="quiet">After you save, you can attach sales you already logged.</p>
            )}
            {error ? <p className="error-text">{error}</p> : null}
            <button type="button" className="btn wide" onClick={onSaveCustomer} disabled={saving}>{saving ? 'Saving…' : 'Save customer'}</button>
            {editingCustomer !== 'new' ? (
              confirmDelete ? (
                <div className="confirm-row">
                  <span>Delete this customer? Their sales stay in the books.</span>
                  <button type="button" className="btn danger" onClick={onDeleteCustomer} disabled={saving}>Delete</button>
                  <button type="button" className="btn ghost" onClick={() => setConfirmDelete(false)}>Keep</button>
                </div>
              ) : (
                <button type="button" className="btn ghost wide" onClick={() => setConfirmDelete(true)}>Delete customer</button>
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

function saleLabel(entry: Entry) {
  return `${prettyDate(entry.occurredOn)} · ${entry.title} · ${money(lineCash(entry))}`
}

function CustomerSales({
  customerId,
  sales,
  openSales,
  saving,
  onLink,
}: {
  customerId: string
  sales: Entry[]
  openSales: Entry[]
  saving: boolean
  onLink: (entry: Entry, customerId: string | null) => void
}) {
  return (
    <div>
      {sales.length === 0 ? <p className="quiet">No sales linked yet.</p> : (
        <div className="ledger">
          {sales.map((entry) => (
            <div key={entry.id} className="shop-order">
              <p className="row-sub">{saleLabel(entry)}</p>
              <button type="button" className="text-btn" onClick={() => onLink(entry, null)} disabled={saving}>Not this buyer</button>
            </div>
          ))}
        </div>
      )}
      {openSales.length > 0 ? (
        <label className="field">
          Attach a past sale
          <select
            value=""
            onChange={(event) => {
              const entry = openSales.find((sale) => sale.id === event.target.value)
              if (entry) onLink(entry, customerId)
            }}
            disabled={saving}
          >
            <option value="">Choose a sale with no buyer</option>
            {openSales.map((entry) => (
              <option key={entry.id} value={entry.id}>{saleLabel(entry)}</option>
            ))}
          </select>
        </label>
      ) : (
        <p className="quiet">Sales you log without a buyer show up here to attach.</p>
      )}
    </div>
  )
}
