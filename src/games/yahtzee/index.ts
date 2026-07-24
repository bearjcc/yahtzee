export * from './types.ts'
export * from './scoring.ts'
export * from './game.ts'
export { encodeYahtzeeInto } from './encode.ts'

import type { Rng } from '../../engine/rng.ts'
import { decodeOutputs } from '../../nn/policy.ts'
import type { ActFn, EpisodeResult, GameModule } from '../types.ts'
import { CATEGORIES } from './types.ts'
import { encodeYahtzeeInto } from './encode.ts'
import { openCategories, playGame, playGameResult, type Decision } from './game.ts'
import type { GameState } from './types.ts'

const categoryMask = new Array<boolean>(CATEGORIES.length).fill(false)
const categoryIndex = new Map<string, number>(CATEGORIES.map((c, i) => [c, i]))

function toYahtzeeDecision(out: Float32Array, state: GameState): Decision {
  const legal = openCategories(state)
  for (let i = 0; i < CATEGORIES.length; i++) categoryMask[i] = false
  for (const c of legal) categoryMask[categoryIndex.get(c)!] = true
  const net = decodeOutputs(out, categoryMask)
  const held = [
    !!net.held[0],
    !!net.held[1],
    !!net.held[2],
    !!net.held[3],
    !!net.held[4],
  ]
  const category = CATEGORIES[net.categoryIndex]!
  const scoreNow = state.rollsRemaining > 0 && net.bankOrScore
  return {
    scoreNow,
    held,
    category: legal.includes(category) ? category : legal[0]!,
  }
}

function playWithNet(rng: Rng, act: ActFn): number {
  return playGame(rng, (state) => {
    const out = act((v) => encodeYahtzeeInto(state, v))
    return toYahtzeeDecision(out, state)
  })
}

function playResultWithNet(rng: Rng, act: ActFn): EpisodeResult {
  const result = playGameResult(rng, (state) => {
    const out = act((v) => encodeYahtzeeInto(state, v))
    return toYahtzeeDecision(out, state)
  })
  return {
    kind: 'yahtzee',
    total: result.total,
    scorecard: result.scorecard,
    yahtzeeBonuses: result.yahtzeeBonuses,
  }
}

export const yahtzeeGame: GameModule = {
  id: 'yahtzee',
  label: 'Yahtzee',
  diceCount: 5,
  oneHotIndex: 0,
  play: playWithNet,
  playResult: playResultWithNet,
}
