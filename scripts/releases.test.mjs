import assert from 'node:assert/strict'
import test from 'node:test'
import { calendarDate, collapseVariants, keepProduct, productRank, rowsForGroup, shiftDate, sortReleases } from '../shared/releases.js'

const pokemon = { key: 'pokemon', categoryId: 3, name: 'Pokémon' }

test('a calendar ship date is midnight, and a catalog sync stamp is not', () => {
  assert.equal(calendarDate('2026-11-06T00:00:00'), '2026-11-06')
  assert.equal(calendarDate('2026-11-06T00:00:00Z'), '2026-11-06')
  assert.equal(calendarDate('2026-09-28T20:00:06.3524868Z'), null)
  assert.equal(calendarDate(null), null)
})

test('shifting a release window stays on the calendar', () => {
  assert.equal(shiftDate('2026-09-28', -45), '2026-08-14')
  assert.equal(shiftDate('2026-03-01', -1), '2026-02-28')
})

test('shop products keep boxes, cases, and decks, and skip loose packs', () => {
  assert.equal(keepProduct('Delta Reign Booster Box'), true)
  assert.equal(keepProduct('Delta Reign Booster Box Case'), true)
  assert.equal(keepProduct('Delta Reign Elite Trainer Box'), true)
  assert.equal(keepProduct('Radiance - Showdown Decks: Evelynn vs Seraphine'), true)
  assert.equal(keepProduct('Delta Reign Booster Pack'), false)
  assert.equal(keepProduct('Radiance - Sleeved Booster Pack'), false)
  assert.equal(keepProduct('Delta Reign Single Pack Blister [Keldeo]'), false)
  assert.equal(keepProduct('Delta Reign 3 Pack Blister [Seel]'), true)
})

test('a product ship date wins over the set date', () => {
  const group = { name: 'ME06: Delta Reign', abbreviation: 'DLR', publishedOn: '2026-11-06T00:00:00', isSupplemental: false }
  const products = [
    {
      productId: 1,
      name: 'Delta Reign Booster Box',
      imageUrl: 'https://example.test/box.jpg',
      url: 'https://example.test/box',
      presaleInfo: { releasedOn: '2026-11-06T00:00:00' },
      extendedData: [],
    },
    {
      productId: 2,
      name: 'Delta Reign Build & Battle Box',
      imageUrl: 'http://example.test/nope.jpg',
      url: 'https://example.test/prerelease',
      presaleInfo: { releasedOn: '2026-11-20T00:00:00' },
      extendedData: [],
    },
    {
      productId: 3,
      name: 'Delta Reign Booster Pack',
      presaleInfo: { releasedOn: '2026-11-06T00:00:00' },
      extendedData: [],
    },
  ]
  const rows = rowsForGroup(pokemon, group, products, '2026-09-28', '2026-08-14')
  assert.deepEqual(rows.map((row) => [row.name, row.releasedOn, row.status, row.imageUrl]), [
    ['Delta Reign Booster Box', '2026-11-06', 'coming', 'https://example.test/box.jpg'],
    ['Delta Reign Build & Battle Box', '2026-11-20', 'coming', null],
  ])
})

test('a set with no listed products says so, and promo dumps stay off the list', () => {
  const missing = rowsForGroup(
    pokemon,
    { name: 'Future Set', abbreviation: 'FUT', publishedOn: '2026-12-01T00:00:00', isSupplemental: false },
    [],
    '2026-09-28',
    '2026-08-14',
  )
  assert.equal(missing.length, 1)
  assert.equal(missing[0].note, 'Individual products are not listed yet.')
  assert.equal(missing[0].productId, null)

  const promo = rowsForGroup(
    pokemon,
    { name: 'Release Event Cards', publishedOn: '2026-12-01T00:00:00', isSupplemental: false },
    [{ productId: 9, name: 'Promo Card', extendedData: [{ name: 'Number', value: '001' }, { name: 'Rarity', value: 'Promo' }] }],
    '2026-09-28',
    '2026-08-14',
  )
  assert.equal(promo.length, 0)
})

test('art variants of a tin share one line and one date', () => {
  const rows = collapseVariants([
    { name: '30th Celebration Mini Tin [Mew]', game: 'pokemon', releasedOn: '2026-10-02', setName: 'ME: 30th Celebration', note: null, productId: 1 },
    { name: '30th Celebration Mini Tin [Zapdos]', game: 'pokemon', releasedOn: '2026-10-02', setName: 'ME: 30th Celebration', note: null, productId: 2 },
    { name: '30th Celebration Mini Tin Display', game: 'pokemon', releasedOn: '2026-10-02', setName: 'ME: 30th Celebration', note: null, productId: 3 },
    { name: 'Delta Reign Booster Box', game: 'pokemon', releasedOn: '2026-11-06', setName: 'ME06: Delta Reign', note: null, productId: 4 },
  ])
  assert.deepEqual(rows.map((row) => [row.name, row.note]), [
    ['30th Celebration Mini Tin', '2 versions, same date.'],
    ['30th Celebration Mini Tin Display', null],
    ['Delta Reign Booster Box', null],
  ])
})

test('coming releases sort ahead of ones already out, boxes before cases', () => {
  const rows = sortReleases([
    { name: 'Old Case', setName: 'Old', releasedOn: '2026-09-01', status: 'out' },
    { name: 'New Case', setName: 'New', releasedOn: '2026-11-06', status: 'coming' },
    { name: 'New Booster Box', setName: 'New', releasedOn: '2026-11-06', status: 'coming' },
    { name: 'Older Box', setName: 'Older', releasedOn: '2026-10-01', status: 'coming' },
  ])
  assert.deepEqual(rows.map((row) => row.name), ['Older Box', 'New Booster Box', 'New Case', 'Old Case'])
  assert.ok(productRank('New Booster Box') < productRank('New Case'))
})
