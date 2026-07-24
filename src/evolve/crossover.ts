import type { Rng } from '../engine/rng.ts'

/** Uniform per-gene crossover then Gaussian mutation. */
export function crossoverAndMutate(
  a: Float32Array,
  b: Float32Array,
  rng: Rng,
  pMut: number,
  mutSigma: number,
): Float32Array {
  const n = a.length
  const child = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    child[i] = rng() < 0.5 ? a[i]! : b[i]!
    if (rng() < pMut) {
      const u = Math.max(rng(), 1e-9)
      const v = Math.max(rng(), 1e-9)
      const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
      child[i]! += z * mutSigma
    }
  }
  return child
}
