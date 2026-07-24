export * from './types.ts'
export * from './scoring.ts'
export * from './game.ts'
export { encodeGoblinInto } from './encode.ts'

import type { Rng } from '../../engine/rng.ts'
import { decodeOutputs } from '../../nn/policy.ts'
import type { ActFn, EpisodeResult, GameModule } from '../types.ts'
import { encodeGoblinInto } from './encode.ts'
import { openCategories, playGame, playGameResult, type Decision } from './game.ts'
import { CATEGORIES, DICE_COUNT, type GameState } from './types.ts'

const categoryMask = new Array<boolean>(CATEGORIES.length).fill(false)
const categoryIndex = new Map<string, number>(CATEGORIES.map((c, i) => [c, i]))

function toGoblinDecision(out: Float32Array, state: GameState): Decision {
  const legal = openCategories(state)
  for (let i = 0; i < CATEGORIES.length; i++) categoryMask[i] = false
  for (const c of legal) categoryMask[categoryIndex.get(c)!] = true
  const net = decodeOutputs(out, categoryMask)
  const held = net.held.slice(0, DICE_COUNT)
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
    const out = act((v) => encodeGoblinInto(state, v))
    return toGoblinDecision(out, state)
  })
}

function playResultWithNet(rng: Rng, act: ActFn): EpisodeResult {
  const result = playGameResult(rng, (state) => {
    const out = act((v) => encodeGoblinInto(state, v))
    return toGoblinDecision(out, state)
  })
  return {
    kind: 'goblinGamble',
    total: result.total,
    scorecard: result.scorecard,
    inspiration: result.inspiration,
  }
}

export const goblinGambleGame: GameModule = {
  id: 'goblinGamble',
  label: 'Goblin Gamble',
  diceCount: DICE_COUNT,
  oneHotIndex: 3,
  play: playWithNet,
  playResult: playResultWithNet,
}
