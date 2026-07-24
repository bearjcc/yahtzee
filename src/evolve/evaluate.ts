import { mulberry32, playGame } from '../engine/index.ts'
import { decide, type NetShape } from '../nn/index.ts'

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
  const gameScores: number[] = []
  for (let g = 0; g < gamesPerFitness; g++) {
    const rng = mulberry32((baseSeed + g * 10007) >>> 0)
    const score = playGame(rng, (state) => decide(state, genome, shape))
    gameScores.push(score)
  }
  const fitness = gameScores.reduce((a, b) => a + b, 0) / gameScores.length
  return { fitness, gameScores }
}
