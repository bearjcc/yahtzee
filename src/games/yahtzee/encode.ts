import { faceCounts } from '../dice.ts'
import {
  CATEGORIES,
  UPPER_BONUS_THRESHOLD,
  UPPER_SECTION,
  type GameState,
} from './types.ts'
import { categoryMaxScore, upperTotal } from './scoring.ts'
import { IN, YAHTZEE_CARD_SIZE } from '../../nn/layout.ts'

export type YahtzeeState = GameState
export { CATEGORIES }

/** Write Yahtzee state into the shared input vector (zeros unused PYL slots). */
export function encodeYahtzeeInto(state: GameState, v: Float32Array): void {
  v.fill(0)

  for (let d = 0; d < 5; d++) v[IN.dice + d] = state.dice[d]! / 6
  // slot 5 unused for Yahtzee

  const counts = faceCounts(state.dice)
  for (let f = 1; f <= 6; f++) v[IN.faceCounts + (f - 1)] = counts[f]! / 5

  v[IN.rollsOrRisk + 0] = state.rollsRemaining / 3
  v[IN.rollsOrRisk + 1] = 0

  v[IN.gameOneHot + 0] = 1 // yahtzee

  let i = IN.yahtzeeCard
  for (const c of CATEGORIES) v[i++] = state.scorecard[c] === null ? 0 : 1

  for (const c of CATEGORIES) {
    const s = state.scorecard[c]
    v[i++] = s === null ? 0 : s / categoryMaxScore(c)
  }

  const up = upperTotal(state.scorecard)
  v[i++] = up / UPPER_BONUS_THRESHOLD
  v[i++] = Math.max(0, UPPER_BONUS_THRESHOLD - up) / UPPER_BONUS_THRESHOLD

  const y = state.scorecard.yahtzee
  v[i++] = y === null ? 1 : 0
  v[i++] = y === 0 ? 1 : 0
  v[i++] = y === 50 ? 1 : 0

  v[i++] = Math.min(state.yahtzeeBonuses, 13) / 13
  v[i++] = state.turn / 13

  if (i !== IN.yahtzeeCard + YAHTZEE_CARD_SIZE) {
    void UPPER_SECTION
    throw new Error(`yahtzee card encode length mismatch: ${i}`)
  }
  // pylProgress left zeroed
}
