import { mulberry32, playGame } from '../engine/index.ts'
import { createScratch, decide, type NetShape } from '../nn/index.ts'

export interface EvalResult {
  fitness: number
  gameScores: number[]
  gameSeeds: number[]
}

/** Sample standard deviation; 0 when fewer than 2 scores. */
export function sampleStdev(scores: number[]): number {
  const n = scores.length
  if (n < 2) return 0
  let sum = 0
  for (const s of scores) sum += s
  const mean = sum / n
  let varSum = 0
  for (const s of scores) {
    const d = s - mean
    varSum += d * d
  }
  return Math.sqrt(varSum / (n - 1))
}

export function fitnessFromScores(gameScores: number[], fitnessStdPenalty: number): number {
  let sum = 0
  for (const s of gameScores) sum += s
  const mean = sum / gameScores.length
  return mean - fitnessStdPenalty * sampleStdev(gameScores)
}

/** How many leading games use the shared batch suite. */
export function sharedGameCount(gamesPerFitness: number, sharedGameFraction: number): number {
  const frac = Math.min(1, Math.max(0, sharedGameFraction))
  return Math.floor(gamesPerFitness * frac)
}

/** Build per-game seeds: shared suite then private random uint32s. */
export function buildGameSeeds(
  gamesPerFitness: number,
  sharedGameFraction: number,
  sharedBase: number,
  privateRng: () => number,
): number[] {
  const sharedN = sharedGameCount(gamesPerFitness, sharedGameFraction)
  const seeds = new Array<number>(gamesPerFitness)
  for (let g = 0; g < sharedN; g++) {
    seeds[g] = (sharedBase + g * 10007) >>> 0
  }
  for (let g = sharedN; g < gamesPerFitness; g++) {
    seeds[g] = (privateRng() * 0x100000000) >>> 0
  }
  return seeds
}

/** Cryptographically strong uint32 in [0, 1) for private game seeds. */
export function cryptoUnit(): number {
  const buf = new Uint32Array(1)
  crypto.getRandomValues(buf)
  return (buf[0]! >>> 0) / 0x100000000
}

export function evaluateGenome(
  genome: Float32Array,
  shape: NetShape,
  gameSeeds: number[],
  fitnessStdPenalty = 0,
): EvalResult {
  const scratch = createScratch(shape)
  const gameScores: number[] = []
  for (let g = 0; g < gameSeeds.length; g++) {
    const rng = mulberry32(gameSeeds[g]!)
    const score = playGame(rng, (state) => decide(state, genome, shape, scratch))
    gameScores.push(score)
  }
  const fitness = fitnessFromScores(gameScores, fitnessStdPenalty)
  return { fitness, gameScores, gameSeeds }
}
