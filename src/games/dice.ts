/** Shared dice helpers used by every ruleset. */

export function faceCounts(dice: number[]): number[] {
  const counts = [0, 0, 0, 0, 0, 0, 0]
  for (const d of dice) {
    if (d >= 1 && d <= 6) counts[d]!++
  }
  return counts
}

export function sumDice(dice: number[]): number {
  let s = 0
  for (const d of dice) s += d
  return s
}
