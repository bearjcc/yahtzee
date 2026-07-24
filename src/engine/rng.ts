/** Mulberry32 — fast seedable PRNG. */
export type Rng = () => number

export function mulberry32(seed: number): Rng {
  let t = seed >>> 0
  return () => {
    t = (t + 0x6d2b79f5) >>> 0
    let r = Math.imul(t ^ (t >>> 15), 1 | t)
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296
  }
}

export function rollDie(rng: Rng): number {
  return 1 + Math.floor(rng() * 6)
}

export function pickIndex(rng: Rng, weights: Float64Array | number[]): number {
  let sum = 0
  for (let i = 0; i < weights.length; i++) sum += weights[i]!
  if (sum <= 0) return Math.floor(rng() * weights.length)
  let r = rng() * sum
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i]!
    if (r <= 0) return i
  }
  return weights.length - 1
}
