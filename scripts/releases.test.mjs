import assert from 'node:assert/strict'
import test from 'node:test'
import { addCenterRows, calendarDate, catalogRows, centerRows, collapseVariants, distributorRows, keepProduct, mergeReleases, onePieceProductRows, pokemonArticleRows, pokemonCenterRows, productRank, riftboundAnnouncementRows, rowsForGroup, shiftDate, shipDate, sortReleases } from '../shared/releases.js'

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

test('a sealed product on an older set shows up when its own ship date is ahead', () => {
  const group = { name: 'Miscellaneous Cards & Products', publishedOn: '2020-01-01T00:00:00', isSupplemental: true }
  const rows = rowsForGroup(pokemon, group, [
    {
      productId: 1,
      name: 'League Battle Deck [Mega Greninja ex]',
      presaleInfo: { releasedOn: '2026-11-13T00:00:00' },
      extendedData: [],
    },
    {
      productId: 2,
      name: 'Nickit',
      presaleInfo: { releasedOn: '2026-11-13T00:00:00' },
      extendedData: [{ name: 'Number', value: '001' }, { name: 'Rarity', value: 'Common' }],
    },
    {
      productId: 3,
      name: 'Old Tin',
      presaleInfo: { releasedOn: '2024-01-01T00:00:00' },
      extendedData: [],
    },
  ], '2026-10-07', '2026-08-23')
  assert.deepEqual(rows.map((row) => [row.name, row.releasedOn, row.note]), [
    ['League Battle Deck [Mega Greninja ex]', '2026-11-13', null],
  ])
})

test('a product added to an older set shows up before it has a ship date', () => {
  const group = { name: 'SWSH09: Brilliant Stars', abbreviation: 'SWSH09', publishedOn: '2022-02-25T00:00:00', isSupplemental: false }
  const older = Array.from({ length: 10 }, (_, index) => ({
    productId: 1000 + index,
    name: `Card ${index}`,
    modifiedOn: '2024-01-01T00:00:00',
    presaleInfo: {},
    extendedData: [{ name: 'Number', value: String(index) }, { name: 'Rarity', value: 'Common' }],
  }))
  const rows = rowsForGroup(pokemon, group, [
    ...older,
    {
      productId: 1002,
      name: 'Brilliant Stars Elite Trainer Box',
      modifiedOn: '2026-10-02T16:14:48.877',
      presaleInfo: {},
      extendedData: [],
    },
    {
      productId: 9000,
      name: 'Brilliant Stars Premium Checklane Blister [Raichu]',
      modifiedOn: '2026-10-02T16:14:48.877',
      imageUrl: 'https://example.test/blister.jpg',
      imageCount: 1,
      url: 'https://example.test/blister',
      presaleInfo: { releasedOn: null },
      extendedData: [],
    },
  ], '2026-10-07', '2026-08-23')
  assert.deepEqual(rows.map((row) => [row.name, row.releasedOn, row.note, row.imageUrl]), [
    ['Brilliant Stars Premium Checklane Blister [Raichu]', '2026-10-02', 'Newly listed. No ship date yet.', 'https://example.test/blister.jpg'],
  ])
})

test('an older set with nothing new does not leave a placeholder', () => {
  const rows = rowsForGroup(
    pokemon,
    { name: 'Jungle', publishedOn: '1999-06-16T00:00:00', isSupplemental: false },
    [],
    '2026-10-07',
    '2026-08-23',
  )
  assert.equal(rows.length, 0)
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

test('an announced set with a release day shows its sealed products before the catalog lists it', () => {
  const html = `
    <h2>Set 6: Legacy</h2>
    <ul><li><strong>3-Letter Code</strong>: LGC</li>
    <li><strong>Dates</strong><ul><li><strong>Release</strong>: January 29, 2027</li></ul></li></ul>
    <p>Products coming in <i>Legacy</i>:</p>
    <ul>
      <li>Booster Packs &amp; Displays</li>
      <li>4 Champion Decks: Tryndamere, Ashe, Lux, Garen</li>
      <li>Vault Bundle</li>
      <li>Pre-Rift kits</li>
      <li>Releasing in February: Proving Grounds, 2nd Edition</li>
    </ul>
    <h2>Set 7: The Reckoning</h2>
    <ul>
      <li><strong>3-Letter Code</strong>: REC</li>
      <li class="ck-list-marker-bold"><strong>Dates</strong><ul>
        <li>Pre-Rift: April 23-29, 2027</li>
        <li>Release: April 30, 2027</li>
      </ul></li>
    </ul>
    <p>Products coming in <i>The Reckoning</i>:</p>
    <ul>
      <li>Booster Packs &amp; Displays</li>
      <li>Champion Decks for Shyvana &amp; Vayne</li>
      <li>Vault Bundle</li>
      <li>Pre-Rift kits</li>
    </ul>
    <h2>Set 8</h2>
    <p><i>Arriving Q3 2027</i></p>
  `
  const rows = riftboundAnnouncementRows(html, 'https://playriftbound.com/en-us/news/announcements/products-and-sets-into-2027/', '2026-11-07', '2026-09-23')
  assert.deepEqual(rows.map((row) => [row.name, row.releasedOn, row.abbreviation]), [
    ['Legacy Booster Display', '2027-01-29', 'LGC'],
    ['Legacy Champion Decks: Tryndamere, Ashe, Lux and Garen', '2027-01-29', 'LGC'],
    ['Legacy Vault Bundle', '2027-01-29', 'LGC'],
    ['Legacy Pre-Rift Kit', '2027-01-29', 'LGC'],
    ['The Reckoning Booster Display', '2027-04-30', 'REC'],
    ['The Reckoning Champion Decks: Shyvana and Vayne', '2027-04-30', 'REC'],
    ['The Reckoning Vault Bundle', '2027-04-30', 'REC'],
    ['The Reckoning Pre-Rift Kit', '2027-04-30', 'REC'],
  ])
  assert.equal(rows.at(-1).linkLabel, 'Riot')
  assert.equal(rows.at(-1).note, 'Announced by Riot.')
})

test('a catalog product keeps its row when Riot has already announced the same set', () => {
  const announced = riftboundAnnouncementRows(`
    <h2>Set 7: The Reckoning</h2>
    <p>Release: April 30, 2027</p>
    <p>3-Letter Code: REC</p>
    <p>Products coming in The Reckoning:</p>
    <ul><li>Booster Packs &amp; Displays</li><li>Vault Bundle</li></ul>
    <h2>Set 6: Legacy</h2>
    <p>Release: January 29, 2027</p>
    <p>3-Letter Code: LGC</p>
    <p>Products coming in Legacy:</p>
    <ul><li>Booster Packs and Displays</li></ul>
  `, 'https://playriftbound.com/example', '2026-11-07', '2026-09-23')
  const merged = mergeReleases([
    { name: 'Legacy - Booster Display', game: 'riftbound', setName: 'Legacy', abbreviation: 'LGC', releasedOn: '2027-01-29', status: 'coming' },
  ], announced)
  assert.deepEqual(merged.map((row) => row.name), [
    'Legacy - Booster Display',
    'The Reckoning Booster Display',
    'The Reckoning Vault Bundle',
  ])
})

test('one piece official products keep decks and set dates, and skip sleeves', () => {
  const html = `
    <a href="https://en.onepiece-cardgame.com/products/op19.html" class="linkListColItem">
      <h4 class="linkListColTitle">BOOSTER PACK -COME IN, WORLD- [OP-19]</h4>
      <time datetime="2027-03-05">March 5, 2027</time>
    </a>
    <a href="/products/sleeves.html" class="linkListColItem">
      <h4 class="linkListColTitle">OFFICIAL CARD SLEEVES 17</h4>
      <time datetime="2027-03-05"></time>
    </a>
    <a href="/products/st38.html" class="linkListColItem">
      <h4 class="linkListColTitle">STARTER DECK -Baroque Works- [ST-38]</h4>
      <time datetime="2027-04-23"></time>
    </a>
    <a class="linkListColItem" href="/products/old.html">
      <h4 class="linkListColTitle">EXTRA BOOSTER -OLD SET- [EB-01]</h4>
      <time datetime="2024-01-01"></time>
    </a>
  `
  const rows = onePieceProductRows(html, '2026-11-07', '2026-09-23')
  assert.deepEqual(rows.map((row) => [row.name, row.abbreviation, row.releasedOn, row.url]), [
    ['Come In, World Booster', 'OP-19', '2027-03-05', 'https://en.onepiece-cardgame.com/products/op19.html'],
    ['Starter Deck -Baroque Works-', 'ST-38', '2027-04-23', 'https://en.onepiece-cardgame.com/products/st38.html'],
  ])
})

test('pokemon center preorders stay visible beside the regular product', () => {
  assert.equal(shipDate('April 30, 2027').iso, '2027-04-30')
  assert.equal(shipDate('Mid November 2026').iso, '2026-11-15')
  assert.equal(shipDate('Mid to late November 2026').iso, '2026-11-20')
  const html = `
    <table><tr><td>Item Name</td><td>Region</td><td>Estimated Ship Date</td></tr>
    <tr><td><ul>
      <li>Pokémon TCG: 30th Celebration Pokémon Center Elite Trainer Box</li>
      <li>Sean Wotherspoon × Pokémon Center: Pikachu Plush</li>
    </ul></td><td>UK</td><td>Mid to late November 2026</td></tr>
    <tr><td><ul>
      <li>Pokémon TCG: Mega Evolution—Delta Reign Pokémon Center Elite Trainer Box</li>
      <li>Pokémon TCG: Mega Evolution—Delta Reign Booster Display Box (36 Packs)</li>
    </ul></td><td>US, CA, UK</td><td>Mid November 2026</td></tr>
    </table>
  `
  const found = pokemonCenterRows(html, '2026-11-07', '2026-09-23')
  assert.deepEqual(centerRows(found).map((row) => [row.name, row.releasedOn, row.setName]), [
    ['30th Celebration Pokémon Center Elite Trainer Box', '2026-11-20', 'Pokémon Center'],
    ['Mega Evolution—Delta Reign Pokémon Center Elite Trainer Box', '2026-11-15', 'Pokémon Center'],
    ['Mega Evolution—Delta Reign Booster Display Box (36 Packs)', '2026-11-15', 'Pokémon Center'],
  ])
  assert.match(found[1].note, /Mid November 2026/)
  assert.match(found[1].note, /US, CA, UK/)
  const article = pokemonArticleRows(`
    <h2>Pokémon TCG: <em>Mega Evolution—Delta Reign</em> Elite Trainer Box</h2>
    <p><strong>Available November 6, 2026</strong></p>
    <h2>Pokémon TCG: <em>Mega Evolution—Delta Reign</em> Pokémon Center Elite Trainer Box</h2>
    <p><strong>Available November 6, 2026</strong></p>
    <h2>Pokémon TCG: Mini Portfolio</h2>
    <p><strong>Available November 6, 2026</strong></p>
  `, 'https://www.pokemon.com/us/news/example', '2026-11-07', '2026-09-23')
  const merged = addCenterRows(mergeReleases([
    { name: 'Delta Reign Elite Trainer Box', game: 'pokemon', setName: 'ME06: Delta Reign', abbreviation: 'DR', releasedOn: '2026-11-06', status: 'coming' },
  ], catalogRows(article)), centerRows([...article, ...found]))
  assert.deepEqual(merged.map((row) => [row.name, row.releasedOn]), [
    ['Delta Reign Elite Trainer Box', '2026-11-06'],
    ['Mega Evolution—Delta Reign Pokémon Center Elite Trainer Box', '2026-11-06'],
    ['30th Celebration Pokémon Center Elite Trainer Box', '2026-11-20'],
    ['Mega Evolution—Delta Reign Pokémon Center Elite Trainer Box', '2026-11-15'],
    ['Mega Evolution—Delta Reign Booster Display Box (36 Packs)', '2026-11-15'],
  ])
  assert.match(merged[1].note, /Pokémon Center product/)
  assert.match(merged[3].note, /Estimated ship/)
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
