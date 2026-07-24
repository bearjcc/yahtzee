import { mulberry32, playGame } from '../engine/index.ts'
import { createScratch, decide, type NetShape } from '../nn/index.ts'

export interface EvalResult {
  fitness: number
  gameScores: number[]
}

export function evaluateGenome(
  genome: Float32Array,
  shape: NetShape,
  gamesPerFitness: number,
  baseSeed: number,
): EvalResult {
  const scratch = createScratch(shape)
  const gameScores: number[] = []
  for (let g = 0; g < gamesPerFitness; g++) {
    const rng = mulberry32((baseSeed + g * 10007) >>> 0)
    const score = playGame(rng, (state) => decide(state, genome, shape, scratch))
    gameScores.push(score)
  }
  let sum = 0
  for (const s of gameScores) sum += s
  const fitness = sum / gameScores.length
  return { fitness, gameScores }
}
