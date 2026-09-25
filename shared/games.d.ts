export type Game = {
  key: string
  categoryId: number
  name: string
}

export const GAMES: Game[]
export function gameByKey(key: string): Game | null
