import assert from 'node:assert/strict'
import test from 'node:test'
import { allocateFees, lineCash, monthBounds, monthNets, positions, realized, summarize } from '../shared/books.js'

function entry(overrides) {
  return {
    id: 'buy-1',
    direction: 'out',
    itemKind: 'card',
    title: 'Charizard',
    detail: '',
    quantity: 1,
    unitAmount: 10,
    fees: 0,
    occurredOn: '2026-09-04',
    notes: '',
    productId: null,
    subtype: null,
    boxesPerCase: null,
    lotId: null,
    createdAt: '2026-09-04T12:00:00Z',
    ...overrides,
  }
}

test('a case purchase counts shipping in the cash out', () => {
  const rows = [entry({ itemKind: 'case', title: 'Prismatic case', quantity: 1, unitAmount: 720, fees: 18, boxesPerCase: 6 })]
  assert.equal(lineCash(rows[0]), 738)
  assert.deepEqual(summarize(rows, '2026-09-01', '2026-09-30'), { spent: 738, made: 0, net: -738 })
})

test('selling half a lot keeps the other half at cost', () => {
  const buy = entry({ id: 'lot', quantity: 2, unitAmount: 10, fees: 1, occurredOn: '2026-09-02' })
  const sale = entry({
    id: 'sale',
    direction: 'in',
    quantity: 1,
    unitAmount: 20,
    fees: 1.5,
    occurredOn: '2026-09-18',
    lotId: 'lot',
    createdAt: '2026-09-18T12:00:00Z',
  })
  const rows = [buy, sale]
  assert.equal(lineCash(sale), 18.5)
  const [lot] = positions(rows)
  assert.equal(lot.remaining, 1)
  assert.equal(lot.costLeft, 10.5)
  assert.equal(lot.unitCost, 10.5)
  assert.deepEqual(realized(rows, '2026-09-01', '2026-09-30'), { total: 8, count: 1 })
  assert.deepEqual(summarize(rows, '2026-09-01', '2026-09-30'), { spent: 21, made: 18.5, net: -2.5 })
})

test('month chart matches the month cash net', () => {
  const rows = [
    entry({ occurredOn: '2026-09-02', unitAmount: 40 }),
    entry({ id: 'in', direction: 'in', itemKind: 'other', occurredOn: '2026-08-02', unitAmount: 15 }),
    entry({ id: 'other-year', occurredOn: '2025-09-02', unitAmount: 9 }),
  ]
  const nets = monthNets(rows, 2026)
  assert.equal(nets[7], 15)
  assert.equal(nets[8], -40)
  assert.equal(nets[8], summarize(rows, ...Object.values(monthBounds(2026, 9))).net)
})

test('shipping on a multi-product order is counted once', () => {
  const shares = allocateFees([10, 20, 30], 6)
  assert.deepEqual(shares, [1, 2, 3])
  const rows = [10, 20, 30].map((price, index) => entry({
    id: `product-${index}`,
    title: `Product ${index + 1}`,
    unitAmount: price,
    fees: shares[index],
    orderId: 'order-1',
  }))
  assert.equal(summarize(rows, '2026-09-01', '2026-09-30').spent, 66)
  assert.equal(positions(rows).reduce((sum, lot) => sum + lot.costLeft, 0), 66)
  const odd = allocateFees([10, 10, 10], 1)
  assert.equal(odd.reduce((sum, value) => sum + value, 0), 1)
  assert.deepEqual(allocateFees([0, 0], 5), [2.5, 2.5])
})

test('fees and misc expenses are not inventory', () => {
  const rows = [
    entry({ itemKind: 'fee', title: 'Shipping', unitAmount: 12 }),
    entry({ itemKind: 'other', title: 'Table fee', unitAmount: 25 }),
    entry({ itemKind: 'box', title: 'Booster box', unitAmount: 100 }),
  ]
  const lots = positions(rows)
  assert.equal(lots.length, 1)
  assert.equal(lots[0].buy.title, 'Booster box')
})
