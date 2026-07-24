import { IN, SCORECARD_SIZE } from '../../nn/layout.ts'
import {
  categoryMaxScore,
  inspirationBonus,
  upperTotal,
} from './scoring.ts'
import {
  CATEGORIES,
  DIE_SIDES,
  DICE_COUNT,
  INSPIRATION_THRESHOLD,
  type GameState,
} from './types.ts'

export { CATEGORIES }

/** Write Goblin Gamble state into the shared input vector. */
export function encodeGoblinInto(state: GameState, v: Float32Array): void {
  v.fill(0)

  for (let d = 0; d < DICE_COUNT; d++) {
    v[IN.dice + d] = state.dice[d]! / DIE_SIDES[d]!
  }
  // faceCounts left zeroed (polyhedral; dice slots carry values)

  v[IN.rollsOrRisk + 0] = state.rollsRemaining / 3
  v[IN.rollsOrRisk + 1] = 0

  v[IN.gameOneHot + 3] = 1 // goblinGamble

  let i = IN.yahtzeeCard
  for (const c of CATEGORIES) v[i++] = state.scorecard[c] === null ? 0 : 1

  for (const c of CATEGORIES) {
    const s = state.scorecard[c]
    v[i++] = s === null ? 0 : s / categoryMaxScore(c)
  }

  const up = upperTotal(state.scorecard)
  v[i++] = up / INSPIRATION_THRESHOLD
  v[i++] = Math.max(0, INSPIRATION_THRESHOLD - up) / INSPIRATION_THRESHOLD
  v[i++] = inspirationBonus(state.scorecard) > 0 ? 1 : 0
  v[i++] = state.scorecard.polymorph === null ? 1 : 0
  v[i++] = state.scorecard.criticalFailure === null ? 1 : 0
  v[i++] = state.scorecard.criticalSuccess === null ? 1 : 0
  v[i++] = state.turn / CATEGORIES.length
  v[i++] = state.hasRolled ? 1 : 0

  // 24 + 24 + 8 = 56
  if (i !== IN.yahtzeeCard + SCORECARD_SIZE) {
    throw new Error(`goblin card encode length mismatch: ${i - IN.yahtzeeCard}`)
  }
}
