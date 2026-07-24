import { mulberry32 } from '../engine/rng.ts'
import { getGame } from '../games/registry.ts'
import { normalizeGameIds, type GameId } from '../games/types.ts'
import { actFromEncode, createScratch, type NetShape } from '../nn/index.ts'

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
  if (gameScores.length === 0) throw new Error('fitnessFromScores: empty scores')
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

/** Build per-episode seeds for one game: shared suite then private random uint32s. */
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

/**
 * Build flat seeds for all selected games.
 * Layout: [game0_ep0..game0_epN-1, game1_ep0..., ...]
 * Shared base is offset per game index for fairness within each game.
 */
export function buildMultiGameSeeds(
  gameIds: GameId[],
  gamesPerFitness: number,
  sharedGameFraction: number,
  sharedBase: number,
  privateRng: () => number,
): number[] {
  const ids = normalizeGameIds(gameIds)
  const out: number[] = []
  for (let gi = 0; gi < ids.length; gi++) {
    const base = (sharedBase + gi * 100003) >>> 0
    out.push(...buildGameSeeds(gamesPerFitness, sharedGameFraction, base, privateRng))
  }
  return out
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
  gameIds: GameId[] = ['yahtzee'],
): EvalResult {
  const ids = normalizeGameIds(gameIds)
  const perGame = Math.floor(gameSeeds.length / ids.length)
  if (perGame < 1 || perGame * ids.length !== gameSeeds.length) {
    throw new Error(
      `gameSeeds length ${gameSeeds.length} not divisible by game count ${ids.length}`,
    )
  }

  const scratch = createScratch(shape)
  const gameScores: number[] = []
  let seedIdx = 0
  for (const id of ids) {
    const game = getGame(id)
    for (let g = 0; g < perGame; g++) {
      const rng = mulberry32(gameSeeds[seedIdx++]!)
      const score = game.play(rng, (encodeInto) =>
        actFromEncode(encodeInto, genome, shape, scratch),
      )
      gameScores.push(score)
    }
  }
  const fitness = fitnessFromScores(gameScores, fitnessStdPenalty)
  return { fitness, gameScores, gameSeeds }
}
