import { createCmaEs } from './cmaEs.ts'
import { createGenerationalGa } from './generationalGa.ts'
import { createLeaderboardGenetics } from './leaderboardGenetics.ts'
import { createOnePlusLambda } from './onePlusLambda.ts'
import { createOpenAiEs } from './openAiEs.ts'
import type { Algorithm } from './types.ts'

const factories: Record<string, () => Algorithm> = {
  leaderboardGenetics: createLeaderboardGenetics,
  generationalGa: createGenerationalGa,
  onePlusLambda: createOnePlusLambda,
  openAiEs: createOpenAiEs,
  cmaEs: createCmaEs,
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
