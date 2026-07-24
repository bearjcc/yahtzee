import { evaluateGenome } from '../evolve/evaluate.ts'
import type { NetShape } from '../nn/network.ts'

export type WorkerRequest = {
  jobId: number
  genome: Float32Array
  shape: NetShape
  gamesPerFitness: number
  baseSeed: number
  parentA: number | null
  parentB: number | null
}

export type WorkerResponse = {
  jobId: number
  fitness: number
  gameScores: number[]
  genome: Float32Array
  parentA: number | null
  parentB: number | null
}

const ctx = self as unknown as {
  onmessage: ((ev: MessageEvent<WorkerRequest>) => void) | null
  postMessage: (msg: WorkerResponse) => void
}

ctx.onmessage = (ev: MessageEvent<WorkerRequest>) => {
  const msg = ev.data
  const result = evaluateGenome(msg.genome, msg.shape, msg.gamesPerFitness, msg.baseSeed)
  ctx.postMessage({
    jobId: msg.jobId,
    fitness: result.fitness,
    gameScores: result.gameScores,
    genome: msg.genome,
    parentA: msg.parentA,
    parentB: msg.parentB,
  })
}
