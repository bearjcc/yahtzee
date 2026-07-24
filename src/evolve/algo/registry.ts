import { createLeaderboardGenetics } from './leaderboardGenetics.ts'
import type { Algorithm } from './types.ts'

const factories: Record<string, () => Algorithm> = {
  leaderboardGenetics: createLeaderboardGenetics,
}

export const DEFAULT_ALGORITHM_ID = 'leaderboardGenetics'

export function listAlgorithms(): Algorithm[] {
  return Object.keys(factories).map((id) => factories[id]!())
}

export function getAlgorithm(id: string): Algorithm {
  const factory = factories[id] ?? factories[DEFAULT_ALGORITHM_ID]!
  return factory()
}

export function isRegisteredAlgorithm(id: string): boolean {
  return Object.prototype.hasOwnProperty.call(factories, id)
}
