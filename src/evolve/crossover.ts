import type { Rng } from '../engine/rng.ts'

/** Box-Muller standard normal. */
function gaussian(rng: Rng): number {
  const u = Math.max(rng(), 1e-9)
  const v = Math.max(rng(), 1e-9)
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

/** Gaussian mutation applied in place. */
export function mutateInPlace(
  genome: Float32Array,
  rng: Rng,
  pMut: number,
  mutSigma: number,
): void {
  for (let i = 0; i < genome.length; i++) {
    if (rng() < pMut) genome[i]! += gaussian(rng) * mutSigma
  }
}

/** Copy then mutate. */
export function mutateCopy(
  genome: Float32Array,
  rng: Rng,
  pMut: number,
  mutSigma: number,
): Float32Array {
  const child = new Float32Array(genome)
  mutateInPlace(child, rng, pMut, mutSigma)
  return child
}

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
  }
  mutateInPlace(child, rng, pMut, mutSigma)
  return child
}
