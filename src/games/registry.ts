import { farkleGame } from './farkle.ts'
import { goblinGambleGame } from './goblinGamble/index.ts'
import { sixCubesGame } from './sixCubes.ts'
import {
  DEFAULT_GAME_IDS,
  normalizeGameIds,
  type GameId,
  type GameModule,
} from './types.ts'
import { yahtzeeGame } from './yahtzee/index.ts'

const factories: Record<GameId, GameModule> = {
  yahtzee: yahtzeeGame,
  farkle: farkleGame,
  sixCubes: sixCubesGame,
  goblinGamble: goblinGambleGame,
}

export function listGames(): GameModule[] {
  return Object.values(factories)
}

export function getGame(id: GameId): GameModule {
  return factories[id] ?? factories.yahtzee
}

export function getGames(ids: GameId[]): GameModule[] {
  return normalizeGameIds(ids).map((id) => getGame(id))
}

export { DEFAULT_GAME_IDS, normalizeGameIds }
