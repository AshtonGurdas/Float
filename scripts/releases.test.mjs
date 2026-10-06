import assert from 'node:assert/strict'
import test from 'node:test'
import { calendarDate, collapseVariants, distributorRows, keepProduct, mergeReleases, productRank, rowsForGroup, shiftDate, sortReleases } from '../shared/releases.js'

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

test('distributor preorders add later sets and skip other games and gear', () => {
  const rows = distributorRows([
    {
      category: '2045',
      products: [
        { productName: 'ONE PIECE CG OP-19 BOOSTER (12/24/12)', categoryCode: '2045', releaseDate: '2027-03-05', imageGuid: 'abc' },
        { productName: 'ONE PIECE CG JAPANESE 4TH ANNIVERSARY SET (4)', categoryCode: '2045', releaseDate: '2027-07-02', imageGuid: null },
        { productName: 'ONE PIECE CG ST39 STARTER DISPLAY (6)', categoryCode: '2045', releaseDate: '2027-04-23' },
        { productName: 'ONE PIECE CG DP14 DOUBLE PACK SET VOL 14', categoryCode: '2045', releaseDate: '2027-03-05' },
        { productName: 'ONE PIECE CG SLEEVES SET 18 12CT ASSORTMENT (8)', categoryCode: '2045', releaseDate: '2027-06-04' },
        { productName: 'GUNDAM CG GD-08 BOOSTER (12/24/12)', categoryCode: '2045', releaseDate: '2027-04-23' },
        { productName: 'GUNDAM CG ST-15 ULTIMATE DECK 02 6CT DISPLAY (4)', categoryCode: '2045', releaseDate: '2027-04-16' },
        { productName: 'DIGIMON CG ST27 ADVANCED DECK DIABOROMON (8/6)', categoryCode: '2045', releaseDate: '2027-03-05' },
        { productName: 'DBS FUSION WORLD ST02 STORY BOOSTER VOL 2 (12/20/12)', categoryCode: '2045', releaseDate: '2027-01-15' },
      ],
    },
    {
      category: '2034',
      products: [
        { productName: 'RIFTBOUND LEAGUE OF LEGENDS TCG LEGACY BOOSTER DISPLAY (14/24/6)', categoryCode: '2034', releaseDate: '2027-01-29' },
        { productName: 'RIFTBOUND LEAGUE OF LEGENDS TCG LEGACY PLAYMAT #1 (6)', categoryCode: '2034', releaseDate: '2027-01-29' },
      ],
    },
  ], '2026-10-03', '2026-08-19')
  assert.deepEqual(rows.map((row) => [row.game, row.name, row.releasedOn, row.linkLabel]), [
    ['onepiece', 'OP-19 Booster', '2027-03-05', 'Universal Distribution'],
    ['onepiece', 'Japanese 4th Anniversary Set', '2027-07-02', 'Universal Distribution'],
    ['onepiece', 'ST-39 Starter Display', '2027-04-23', 'Universal Distribution'],
    ['onepiece', 'DP-14 Double Pack Set Vol 14', '2027-03-05', 'Universal Distribution'],
    ['riftbound', 'Legacy Booster Display', '2027-01-29', 'Universal Distribution'],
  ])
  assert.equal(rows[0].imageUrl, 'https://ca.universaldist.com/api/v1/images/abc/raw?size=s')
  assert.equal(rows[1].note, 'Distributor ship date. It can move.')
})

test('a distributor row stays off the list when TCGplayer already has that product', () => {
  const tcg = [
    { name: 'Legacy - Booster Display', game: 'riftbound', setName: 'Legacy', abbreviation: 'LGC', releasedOn: '2027-01-29', status: 'coming' },
    { name: 'The Dominance of God Booster Box', game: 'onepiece', setName: 'The Dominance of God', abbreviation: 'OP18', releasedOn: '2026-11-20', status: 'coming' },
  ]
  const extra = distributorRows([
    {
      category: '2034',
      products: [
        { productName: 'RIFTBOUND LEAGUE OF LEGENDS TCG LEGACY BOOSTER DISPLAY (14/24/6)', categoryCode: '2034', releaseDate: '2027-01-29' },
        { productName: 'RIFTBOUND LEAGUE OF LEGENDS TCG LEGACY PRE-RIFT EVENT KIT', categoryCode: '2034', releaseDate: '2027-01-22' },
      ],
    },
    {
      category: '2045',
      products: [
        { productName: 'ONE PIECE CG JAPANESE 4TH ANNIVERSARY SET (4)', categoryCode: '2045', releaseDate: '2027-07-02' },
      ],
    },
  ], '2026-10-03', '2026-08-19')
  const merged = mergeReleases(tcg, extra)
  assert.deepEqual(merged.map((row) => row.name), [
    'Legacy - Booster Display',
    'The Dominance of God Booster Box',
    'Legacy Pre-Rift Event Kit',
    'Japanese 4th Anniversary Set',
  ])
  const withSameProduct = mergeReleases([
    ...tcg,
    { name: 'Legacy - Pre-Rift Event Kit', game: 'riftbound', setName: 'Legacy', abbreviation: 'LGC', releasedOn: '2027-01-29', status: 'coming' },
    { name: 'Legacy - Vault Bundle', game: 'riftbound', setName: 'Legacy', abbreviation: 'LGC', releasedOn: '2027-01-29', status: 'coming' },
  ], [
    ...extra,
    ...distributorRows([{
      category: '2034',
      products: [
        { productName: 'RIFTBOUND LEAGUE OF LEGENDS TCG LEGACY VAULT', categoryCode: '2034', releaseDate: '2027-01-29' },
      ],
    }], '2026-10-03', '2026-08-19'),
  ])
  assert.deepEqual(withSameProduct.map((row) => row.name), [
    'Legacy - Booster Display',
    'The Dominance of God Booster Box',
    'Legacy - Pre-Rift Event Kit',
    'Legacy - Vault Bundle',
    'Japanese 4th Anniversary Set',
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
