import { faceCounts } from './dice.ts'

export type PylScoringMode = 'farkle' | 'sixCubes'

/**
 * Score a multiset of dice under the given mode.
 * Returns points only when every die is used in a scoring combination; else 0.
 */
export function scoreAllUsed(dice: number[], mode: PylScoringMode): number {
  if (dice.length === 0) return 0
  const counts = faceCounts(dice)
  const n = dice.length

  // Straight 1-6
  if (n === 6 && counts.slice(1).every((c) => c === 1)) {
    return 1500
  }

  if (mode === 'farkle') {
    // Three pairs
    if (n === 6) {
      let pairs = 0
      for (let f = 1; f <= 6; f++) if (counts[f] === 2) pairs++
      if (pairs === 3) return 1500
    }
    // Two triplets
    if (n === 6) {
      let trips = 0
      for (let f = 1; f <= 6; f++) if (counts[f] === 3) trips++
      if (trips === 2) return 2500
    }
  }

  // Consume of-a-kind (3+) then leftover 1s and 5s.
  let points = 0
  let used = 0
  const rem = counts.slice()

  for (let f = 1; f <= 6; f++) {
    const c = rem[f]!
    if (c < 3) continue
    const base = f === 1 ? 1000 : f * 100
    // 3→1x, 4→2x, 5→3x, 6→4x
    const mult = c - 2
    points += base * mult
    used += c
    rem[f] = 0
  }

  // Singles: 1s and 5s only
  points += rem[1]! * 100
  used += rem[1]!
  rem[1] = 0
  points += rem[5]! * 50
  used += rem[5]!
  rem[5] = 0

  for (let f = 1; f <= 6; f++) {
    if (rem[f]! > 0) return 0
  }
  if (used !== n) return 0
  return points
}

export type ScoredSubset = {
  mask: boolean[]
  points: number
}

/** Best-scoring non-empty subset where every selected die scores. */
export function bestScoringSubset(dice: number[], mode: PylScoringMode): ScoredSubset | null {
  const n = dice.length
  let bestPoints = 0
  let bestMask: boolean[] | null = null
  const total = 1 << n
  for (let bits = 1; bits < total; bits++) {
    const subset: number[] = []
    const mask = new Array<boolean>(n).fill(false)
    for (let i = 0; i < n; i++) {
      if (bits & (1 << i)) {
        mask[i] = true
        subset.push(dice[i]!)
      }
    }
    const pts = scoreAllUsed(subset, mode)
    if (pts > bestPoints) {
      bestPoints = pts
      bestMask = mask
    }
  }
  if (!bestMask) return null
  return { mask: bestMask, points: bestPoints }
}

/** Whether the roll has any scoring dice. */
export function canScore(dice: number[], mode: PylScoringMode): boolean {
  return bestScoringSubset(dice, mode) !== null
}

/**
 * Interpret a hold mask as set-aside scoring dice.
 * If illegal, fall back to the best legal subset of the roll.
 */
export function resolveSetAside(
  dice: number[],
  held: boolean[],
  mode: PylScoringMode,
): ScoredSubset {
  const n = dice.length
  const subset: number[] = []
  const mask = new Array<boolean>(n).fill(false)
  for (let i = 0; i < n; i++) {
    if (held[i]) {
      mask[i] = true
      subset.push(dice[i]!)
    }
  }
  if (subset.length > 0) {
    const pts = scoreAllUsed(subset, mode)
    if (pts > 0) return { mask, points: pts }
  }
  const best = bestScoringSubset(dice, mode)
  if (!best) return { mask: new Array<boolean>(n).fill(false), points: 0 }
  return best
}
