import assert from 'node:assert/strict'
import test from 'node:test'
import { pickSale, saleGap } from '../shared/sales.js'

test('a foreign copy listed on the english product is skipped', () => {
  const sales = [
    { variant: 'Foil', language: 'English', title: '**Chinese Ultrasoft Poro Secret Garden Promo**', purchasePrice: 29.99 },
    { variant: 'Foil', language: 'Chinese', title: 'Ultrasoft Poro', purchasePrice: 20 },
    { variant: 'Foil', language: 'English', title: 'Ultrasoft Poro', purchasePrice: 70 },
    { variant: 'Foil', language: 'English', title: 'Ultrasoft Poro', purchasePrice: 130 },
  ]
  assert.equal(pickSale(sales, 'Foil').purchasePrice, 70)
  assert.equal(pickSale([sales[0]], 'Foil'), null)
})

test('the last sold price is the newest sale of the watched printing', () => {
  const sales = [
    { variant: 'Normal', purchasePrice: 4, orderDate: '2026-09-30T03:00:00Z' },
    { variant: 'Foil', purchasePrice: 170.99, orderDate: '2026-09-30T03:13:14Z' },
    { variant: 'Foil', purchasePrice: 169, orderDate: '2026-09-30T02:00:00Z' },
  ]
  assert.equal(pickSale(sales, 'Foil').purchasePrice, 170.99)
  assert.equal(pickSale(sales, 'Normal').purchasePrice, 4)
  assert.equal(pickSale(sales, 'Holofoil'), null)
})

test('the gap is the last sale minus the market price', () => {
  assert.deepEqual(saleGap(170.9, 170.99), { change: 0.09, pct: 0.09 / 170.9 * 100 })
  assert.deepEqual(saleGap(170.9, 160), { change: -10.9, pct: -10.9 / 170.9 * 100 })
  assert.deepEqual(saleGap(null, 10), { change: null, pct: null })
  assert.deepEqual(saleGap(0, 10), { change: null, pct: null })
})
