export const GAMES = [
  { key: 'pokemon', categoryId: 3, name: 'Pokémon' },
  { key: 'pokemon-jp', categoryId: 85, name: 'Pokémon Japan' },
  { key: 'magic', categoryId: 1, name: 'Magic' },
  { key: 'yugioh', categoryId: 2, name: 'Yu-Gi-Oh!' },
  { key: 'onepiece', categoryId: 68, name: 'One Piece' },
  { key: 'lorcana', categoryId: 71, name: 'Lorcana' },
  { key: 'fab', categoryId: 62, name: 'Flesh and Blood' },
  { key: 'digimon', categoryId: 63, name: 'Digimon' },
  { key: 'swu', categoryId: 79, name: 'Star Wars' },
  { key: 'gundam', categoryId: 86, name: 'Gundam' },
  { key: 'riftbound', categoryId: 89, name: 'Riftbound' },
]

export function gameByKey(key) {
  return GAMES.find((game) => game.key === key) || null
}
