import { evaluateGenome } from '../evolve/evaluate.ts'
import type { NetShape } from '../nn/index.ts'

export type WorkerRequest = {
  jobId: number
  genome: Float32Array
  shape: NetShape
  gameSeeds: number[]
  fitnessStdPenalty: number
  parentA: number | null
  parentB: number | null
}

export type WorkerResponse = {
  jobId: number
  fitness: number
  gameScores: number[]
  gameSeeds: number[]
  genome: Float32Array
}

const ctx = self as unknown as {
  onmessage: ((ev: MessageEvent<WorkerRequest>) => void) | null
  postMessage: (msg: WorkerResponse, transfer?: Transferable[]) => void
}

ctx.onmessage = (ev: MessageEvent<WorkerRequest>) => {
  const msg = ev.data
  const result = evaluateGenome(
    msg.genome,
    msg.shape,
    msg.gameSeeds,
    msg.fitnessStdPenalty,
  )
  const res: WorkerResponse = {
    jobId: msg.jobId,
    fitness: result.fitness,
    gameScores: result.gameScores,
    gameSeeds: result.gameSeeds,
    genome: msg.genome,
  }
  ctx.postMessage(res, [msg.genome.buffer])
}
