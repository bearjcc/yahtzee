import {
  CATEGORIES,
  UPPER_BONUS_THRESHOLD,
  UPPER_SECTION,
  categoryMaxScore,
  faceCounts,
  upperTotal,
  type GameState,
} from '../engine/index.ts'

/** Fixed input size for the policy net. */
export const INPUT_SIZE = 45
/** hold[5] + scoreNow[1] + category[13] */
export const OUTPUT_SIZE = 19

export function encodeState(state: GameState): Float32Array {
  const v = new Float32Array(INPUT_SIZE)
  let i = 0

  for (let d = 0; d < 5; d++) v[i++] = state.dice[d]! / 6

  const counts = faceCounts(state.dice)
  for (let f = 1; f <= 6; f++) v[i++] = counts[f]! / 5

  v[i++] = state.rollsRemaining / 3

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

  // pad / assert
  if (i !== INPUT_SIZE) {
    // keep unused UPPER_SECTION reference for future features
    void UPPER_SECTION
    throw new Error(`encodeState length mismatch: ${i} !== ${INPUT_SIZE}`)
  }
  return v
}
