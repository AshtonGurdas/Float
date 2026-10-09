import assert from 'node:assert/strict'
import test from 'node:test'
import { matchGroup, pickSealed, sealedKind } from '../shared/pictures.js'

const groups = [
  { name: 'ME: Mega Evolution', group_id: 2, category_id: 3, game_key: 'pokemon' },
  { name: 'ME06: Delta Reign', group_id: 1, category_id: 3, game_key: 'pokemon' },
  { name: 'ME: 30th Celebration', group_id: 3, category_id: 3, game_key: 'pokemon' },
  { name: 'ME: 30th Celebration Classic Collection', group_id: 4, category_id: 3, game_key: 'pokemon' },
  { name: 'Radiance', group_id: 5, category_id: 89, game_key: 'riftbound' },
  { name: 'Gift of the Rift Bundle', group_id: 9, category_id: 89, game_key: 'riftbound' },
]

const delta = [
  { name: 'Delta Reign Booster Box', sealed: true },
  { name: 'Delta Reign Booster Box Case', sealed: true },
  { name: 'Delta Reign Booster Bundle', sealed: true },
  { name: 'Delta Reign Elite Trainer Box', sealed: true },
  { name: 'Delta Reign Pokemon Center Elite Trainer Box (Exclusive)', sealed: true },
  { name: 'Code Card - Delta Reign Elite Trainer Box', sealed: true },
]

const celebration = [
  { name: '30th Celebration Ultra-Premium Collection [Day]', sealed: true },
  { name: '30th Celebration Ultra-Premium Collection [Night]', sealed: true },
  { name: '30th Celebration Ultra-Premium Collection Case', sealed: true },
]

const radiance = [
  { name: 'Radiance - Booster Display', sealed: true },
  { name: 'Radiance - Booster Display Case', sealed: true },
  { name: 'Radiance - Booster Pack', sealed: true },
]

test('stock titles land on the sealed product they name', () => {
  assert.equal(sealedKind('Daring Poro (Overnumbered) - Unleashed (UNL)'), '')
  const checks = [
    ['Riftbound League of Legends Radiance Booster Box', radiance, 'Radiance - Booster Display'],
    ['Riftbound Radiance Booster Box', radiance, 'Radiance - Booster Display'],
    ['Radiance Booster Display', radiance, 'Radiance - Booster Display'],
    ['Radiance - Booster Display 6x', radiance, 'Radiance - Booster Display'],
    ['Pokemon TCG: Mega Evolution-Delta Reign Booster Bundle (6 Packs)', delta, 'Delta Reign Booster Bundle'],
    ['Pokemon TCG: Mega Evolution-Delta Reign Booster Display Box (36 Packs)', delta, 'Delta Reign Booster Box'],
    ['Pokemon TCG: Mega Evolution-Delta Reign Booster Display Box', delta, 'Delta Reign Booster Box'],
    ['Pokemon TCG: Mega Evolution-Delta Reign Booster Bundle', delta, 'Delta Reign Booster Bundle'],
    ['Pokemon TCG: Mega Evolution-Delta Reign Pokemon Center Elite Trainer Box', delta, 'Delta Reign Pokemon Center Elite Trainer Box (Exclusive)'],
    ['Pokemon 30th celebration (Day) Ultra-Premium Collection', celebration, '30th Celebration Ultra-Premium Collection [Day]'],
    ['Riftbound: League of Legends TCG Gift of the Rift Bundle', [{ name: 'Gift of the Rift Bundle', sealed: true }], 'Gift of the Rift Bundle'],
  ]
  for (const [title, products, expected] of checks) {
    const group = matchGroup(groups, title)
    assert.ok(group, title)
    assert.equal(pickSealed(products, title).name, expected, title)
  }
  assert.equal(matchGroup(groups, 'Pokemon TCG: Mega Evolution-Delta Reign Booster Bundle').name, 'ME06: Delta Reign')
  assert.equal(matchGroup(groups, 'Pokemon 30th celebration (Day) Ultra-Premium Collection').name, 'ME: 30th Celebration')
  assert.equal(sealedKind('Riftbound: League of Legends TCG Gift of the Rift Bundle'), 'bundle')
  assert.equal(sealedKind('Radiance - Vault Bundle'), 'vault')
  assert.equal(sealedKind('Legacy - Pre-Rift Event Kit'), 'kit')
  assert.equal(sealedKind('Radiance - Showdown Decks: Evelynn vs Seraphine'), 'deck')
  assert.equal(sealedKind('Deck Box'), '')
  assert.equal(pickSealed(radiance, 'Daring Poro (Overnumbered) - Unleashed (UNL)'), null)
})
