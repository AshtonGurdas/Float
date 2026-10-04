import assert from 'node:assert/strict'
import test from 'node:test'
import { findPicture, kindOf, parseOnePieceIndex, parseRiftboundArticle, setsMatch } from '../shared/art.js'
import { rowsForGroup } from '../shared/releases.js'

const radiance = `
<title>The Radiance Overview</title>
<h1>The Radiance Overview</h1>
<img src="https://cmsassets.rgpub.io/sanity/images/hero-1920x1080.jpg" width="1920" height="1080">
<h2>Welcome</h2>
<h2><i>Radiance</i> Product Line-Up</h2>
<h3>Booster Display</h3>
<img src="https://cmsassets.rgpub.io/sanity/images/box-2312x1300.jpg" width="2312" height="1300">
<h3>Showdown Decks</h3>
<img src="https://cmsassets.rgpub.io/sanity/images/deck-2312x1300.jpg" width="2312" height="1300">
<h3>Seraphine Preconstructed Decklist</h3>
<img src="https://cmsassets.rgpub.io/sanity/images/card-744x1039.jpg" width="744" height="1039">
<h3>Vault</h3>
<img src="https://cmsassets.rgpub.io/sanity/images/vault-2312x1300.jpg" width="2312" height="1300">
<h3>Pre-Rift Kits</h3>
<img src="https://cmsassets.rgpub.io/sanity/images/kit-2312x1300.jpg" width="2312" height="1300">
`

const legacy = `
<h2>Set 6: Legacy</h2>
<img src="https://cmsassets.rgpub.io/sanity/images/logo-1478x832.jpg" width="1478" height="832">
<img src="https://cmsassets.rgpub.io/sanity/images/legacy-2880x1620.jpg" width="2880" height="1620">
<h2>Pack Contents Updates</h2>
<h2>Proving Grounds, 2nd Edition</h2>
<img src="https://cmsassets.rgpub.io/sanity/images/pg-3840x2160.jpg" width="3840" height="2160">
`

const onepiece = `
<li class="linkListColBox" data-cat="boosters">
  <img class="lazy" src="/renewal/images/common/thumbnail/img_thumbnail_sq.webp" data-src="/onepiececg/bccard/en/products/op18/img_item01.webp?_=1">
  <h4 class="linkListColTitle">BOOSTER PACK  -THE DOMINANCE OF GOD- [OP-18]</h4>
</li>
<li class="linkListColBox">
  <img data-src="/onepiececg/bccard/en/products/eb05/img_item01.webp">
  <h4 class="linkListColTitle">EXTRA BOOSTER -ONE PIECE HEROINES EDITION vol.2- [EB-05]</h4>
</li>
`

test('riftbound articles keep the product photo and skip the header and card crops', () => {
  const shots = [...parseRiftboundArticle(radiance), ...parseRiftboundArticle(legacy)]
  assert.deepEqual(shots.map((shot) => [shot.set, shot.kind, shot.url.split('/').pop()]), [
    ['Radiance', 'box', 'box-2312x1300.jpg'],
    ['Radiance', 'deck', 'deck-2312x1300.jpg'],
    ['Radiance', 'vault', 'vault-2312x1300.jpg'],
    ['Radiance', 'kit', 'kit-2312x1300.jpg'],
    ['Legacy', 'box', 'legacy-2880x1620.jpg'],
    ['Proving Grounds, 2nd Edition', 'box', 'pg-3840x2160.jpg'],
  ])
})

test('one piece product tiles use the real pack image and the set code', () => {
  const items = parseOnePieceIndex(onepiece)
  assert.equal(items.length, 2)
  assert.equal(items[0].code, 'OP-18')
  assert.equal(items[0].url, 'https://en.onepiece-cardgame.com/onepiececg/bccard/en/products/op18/img_item01.webp')
  assert.equal(items[1].code, 'EB-05')
})

test('a sealed row uses the matching product photo, and a different set does not', () => {
  const art = {
    riftbound: [...parseRiftboundArticle(radiance), ...parseRiftboundArticle(legacy)],
    onepiece: parseOnePieceIndex(onepiece),
  }
  const picture = (game, setName, name, abbreviation) => findPicture(art, { game, setName, name, abbreviation })
  assert.equal(picture('riftbound', 'Radiance', 'Radiance - Booster Display'), 'https://cmsassets.rgpub.io/sanity/images/box-2312x1300.jpg')
  assert.equal(picture('riftbound', 'Radiance', 'Radiance - Booster Display Case'), 'https://cmsassets.rgpub.io/sanity/images/box-2312x1300.jpg')
  assert.equal(picture('riftbound', 'Radiance', 'Radiance - Showdown Decks: Evelynn vs Seraphine'), 'https://cmsassets.rgpub.io/sanity/images/deck-2312x1300.jpg')
  assert.equal(picture('riftbound', 'Radiance', 'Radiance - Showdown Decks: Evelynn vs Seraphine Display'), 'https://cmsassets.rgpub.io/sanity/images/deck-2312x1300.jpg')
  assert.equal(picture('riftbound', 'Radiance', 'Radiance - Vault Bundle'), 'https://cmsassets.rgpub.io/sanity/images/vault-2312x1300.jpg')
  assert.equal(picture('riftbound', 'Radiance', 'Radiance - Sleeved Booster Pack Art Bundle (Set of 3)'), 'https://cmsassets.rgpub.io/sanity/images/box-2312x1300.jpg')
  assert.equal(picture('riftbound', 'Legacy', 'Legacy - Booster Display'), 'https://cmsassets.rgpub.io/sanity/images/legacy-2880x1620.jpg')
  assert.equal(picture('riftbound', 'Legacy', 'Legacy - Vault Bundle Case'), 'https://cmsassets.rgpub.io/sanity/images/legacy-2880x1620.jpg')
  assert.equal(picture('riftbound', 'Legacy', 'Legacy - Pre-Rift Kit'), 'https://cmsassets.rgpub.io/sanity/images/legacy-2880x1620.jpg')
  assert.equal(picture('riftbound', 'Radiance', 'Radiance - Art Sleeves'), null)
  assert.equal(picture('riftbound', 'Spiritforged', 'Spiritforged - Booster Display'), null)
  assert.equal(picture('onepiece', 'The Dominance of God', 'The Dominance of God Booster Box', 'OP18'), 'https://en.onepiece-cardgame.com/onepiececg/bccard/en/products/op18/img_item01.webp')
  assert.equal(picture('onepiece', 'The Dominance of God', 'The Dominance of God Booster Box Case'), 'https://en.onepiece-cardgame.com/onepiececg/bccard/en/products/op18/img_item01.webp')
  assert.equal(picture('onepiece', 'The Dominance of God', 'Double Pack Set Vol. 13'), 'https://en.onepiece-cardgame.com/onepiececg/bccard/en/products/op18/img_item01.webp')
  assert.equal(picture('onepiece', "Extra Booster: One Piece Heroine's Edition Vol. 2", 'Extra Booster: One Piece Heroines Edition Vol.2 - Booster Box'), 'https://en.onepiece-cardgame.com/onepiececg/bccard/en/products/eb05/img_item01.webp')
  assert.equal(picture('pokemon', 'ME06: Delta Reign', 'Delta Reign Booster Box'), null)
  assert.equal(setsMatch('Proving Grounds', 'Proving Grounds, 2nd Edition'), false)
  assert.equal(kindOf('Radiance - Art Sleeves'), 'gear')
})

test('an unpublished tcgplayer image is left blank so a letter is not a broken file', () => {
  const pokemon = { key: 'pokemon', categoryId: 3, name: 'Pokémon' }
  const rows = rowsForGroup(
    pokemon,
    { name: 'Radiance', abbreviation: 'RAD', publishedOn: '2026-10-23T00:00:00', isSupplemental: false },
    [{
      productId: 711365,
      name: 'Radiance - Booster Display',
      imageUrl: 'https://tcgplayer-cdn.tcgplayer.com/product/711365_200w.jpg',
      imageCount: 0,
      presaleInfo: { releasedOn: '2026-10-23T00:00:00' },
      extendedData: [],
    }],
    '2026-10-03',
    '2026-08-19',
  )
  assert.equal(rows[0].imageUrl, null)
})
