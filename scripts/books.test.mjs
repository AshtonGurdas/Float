import assert from 'node:assert/strict'
import test from 'node:test'
import { allocateFees, averageCosts, costGroupKey, lineCash, monthBounds, monthNets, openEstimate, positions, realized, saleTake, summarize } from '../shared/books.js'
import { lotMarket, toCad } from '../shared/market.js'

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

test('a down month stays the cash net while sale profit stays separate', () => {
  const buy = entry({ id: 'poro', title: 'Daring Poro', unitAmount: 231, occurredOn: '2026-09-23' })
  const sale = entry({ id: 'sale', direction: 'in', title: 'Daring Poro', unitAmount: 270, occurredOn: '2026-09-30', lotId: 'poro' })
  const box = entry({ id: 'box', title: 'Booster box', itemKind: 'box', unitAmount: 400, occurredOn: '2026-09-02' })
  const rows = [buy, sale, box]
  assert.deepEqual(saleTake(buy, sale), { proceeds: 270, cost: 231, profit: 39 })
  assert.deepEqual(realized(rows, '2026-09-01', '2026-09-30'), { total: 39, count: 1 })
  assert.deepEqual(summarize(rows, '2026-09-01', '2026-09-30'), { spent: 631, made: 270, net: -361 })
  assert.equal(monthNets(rows, 2026)[8], -361)
  const tin = entry({ id: 'tin', title: 'Tin', unitAmount: 10, occurredOn: '2026-09-04' })
  const tinSale = entry({ id: 'tin-sale', direction: 'in', title: 'Tin', unitAmount: 16, occurredOn: '2026-09-30', lotId: 'tin' })
  assert.equal(realized([...rows, tin, tinSale], '2026-09-01', '2026-09-30').total, 45)
})

test('average cost counts each purchase once, skips tax and shipping, and keeps a case separate', () => {
  const rows = [
    entry({ id: 'a', itemKind: 'box', title: 'Riftbound League of Legends Radiance Booster Box', quantity: 2, unitAmount: 90, fees: 15 }),
    entry({ id: 'b', itemKind: 'box', title: 'Radiance Booster Display', quantity: 1, unitAmount: 120, fees: 0 }),
    entry({ id: 'c', itemKind: 'box', title: 'Radiance - Booster Display 6x', quantity: 6, unitAmount: 80, fees: 40 }),
    entry({ id: 'case', itemKind: 'case', title: 'Radiance Booster Case', quantity: 1, unitAmount: 500, fees: 20 }),
    entry({ id: 'd', itemKind: 'sealed', title: 'Pokemon TCG: Mega Evolution-Delta Reign Booster Bundle (6 Packs)', quantity: 1, unitAmount: 40, fees: 0 }),
    entry({ id: 'e', itemKind: 'box', title: 'Pokemon TCG: Mega Evolution-Delta Reign Booster Display Box (36 Packs)', quantity: 1, unitAmount: 150, fees: 8 }),
    entry({ id: 'gone', itemKind: 'box', title: 'Radiance Booster Box', quantity: 4, unitAmount: 70, fees: 9 }),
    entry({ id: 'sale', direction: 'in', title: 'Radiance Booster Box', quantity: 1, unitAmount: 200, lotId: 'a' }),
    entry({ id: 'sale-gone', direction: 'in', title: 'Radiance Booster Box', quantity: 4, unitAmount: 200, lotId: 'gone' }),
    entry({ itemKind: 'fee', title: 'Shipping', unitAmount: 12 }),
  ]
  assert.equal(costGroupKey(rows[0].title), costGroupKey(rows[1].title))
  assert.equal(costGroupKey(rows[0].title), costGroupKey(rows[2].title))
  assert.notEqual(costGroupKey(rows[0].title), costGroupKey('Radiance Booster Case'))
  assert.notEqual(costGroupKey(rows[4].title), costGroupKey(rows[5].title))
  assert.equal(costGroupKey('Pokemon 30th celebration (Day) Ultra-Premium Collection'), 'upc|30th celebration day')
  assert.notEqual(
    costGroupKey('Pokemon 30th celebration (Day) Ultra-Premium Collection'),
    costGroupKey('Pokemon 30th celebration (Night) Ultra-Premium Collection'),
  )
  const averages = averageCosts(rows)
  const radiance = averages.get(costGroupKey(rows[0].title))
  assert.equal(radiance.average, 96.67)
  assert.equal(radiance.quantity, 8)
  assert.equal(radiance.lines, 3)
  assert.equal(radiance.fees, 55)
  assert.equal(averages.get(costGroupKey('Radiance Booster Case')).average, 500)
  assert.equal(averages.get(costGroupKey('Radiance Booster Case')).lines, 1)
  assert.equal(averages.has(costGroupKey('Shipping')), false)
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

test('a ballpark uses the price you give and leaves the cash profit alone', () => {
  const buy = entry({
    id: 'lot',
    itemKind: 'box',
    title: 'Radiance box',
    quantity: 2,
    unitAmount: 100,
    fees: 10,
    expectEach: 180,
  })
  const sale = entry({
    id: 'sale',
    direction: 'in',
    quantity: 1,
    unitAmount: 150,
    occurredOn: '2026-09-18',
    lotId: 'lot',
    createdAt: '2026-09-18T12:00:00Z',
  })
  const rows = [buy, sale]
  const lots = positions(rows)
  const estimate = openEstimate(lots, (lot) => lot.buy.expectEach)
  assert.equal(lots[0].remaining, 1)
  assert.equal(lots[0].costLeft, 105)
  assert.equal(estimate.proceeds, 180)
  assert.equal(estimate.cost, 105)
  assert.equal(estimate.profit, 75)
  assert.equal(estimate.priced, 1)
  assert.equal(estimate.missing, 0)
  assert.deepEqual(realized(rows), { total: 45, count: 1 })
  assert.equal(summarize(rows).net, -60)
  const unpriced = openEstimate(lots, () => null)
  assert.equal(unpriced.priced, 0)
  assert.equal(unpriced.missing, 1)
  assert.equal(unpriced.profit, 0)
  const sold = entry({ id: 'gone', quantity: 1, unitAmount: 40 })
  const gone = positions([
    sold,
    entry({ id: 'sold', direction: 'in', quantity: 1, unitAmount: 50, lotId: 'gone' }),
  ])
  assert.equal(openEstimate(gone, () => 80).priced, 0)
  assert.equal(lotMarket('case', 6, 'Radiance Booster Display', 100), 600)
  assert.equal(lotMarket('case', 6, 'Radiance Booster Case', 540), 540)
  assert.equal(lotMarket('box', null, 'Radiance Booster Display', 100), 100)
  assert.equal(toCad(139.55, 1.4057), 196.17)
  assert.equal(toCad(100, 1.4), 140)
  assert.equal(toCad(null, 1.4), null)
  assert.equal(toCad(10, 0), null)
})
