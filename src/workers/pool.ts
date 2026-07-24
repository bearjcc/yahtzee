import type { NetShape } from '../nn/network.ts'
import type { WorkerRequest, WorkerResponse } from './evalWorker.ts'

export type EvalJob = {
  genome: Float32Array
  shape: NetShape
  gamesPerFitness: number
  baseSeed: number
  parentA: number | null
  parentB: number | null
}

export type EvalJobResult = {
  jobId: number
  fitness: number
  gameScores: number[]
  genome: Float32Array
  parentA: number | null
  parentB: number | null
}

type QueueItem = {
  job: EvalJob
  resolve: (r: EvalJobResult) => void
  reject: (e: unknown) => void
  jobId: number
}

export class WorkerPool {
  private workers: Worker[] = []
  private idle: Worker[] = []
  private queue: QueueItem[] = []
  private inFlight = new Map<number, QueueItem>()
  private nextJobId = 1

  constructor(size = Math.max(1, navigator.hardwareConcurrency || 4)) {
    const n = size
    for (let i = 0; i < n; i++) {
      const w = new Worker(new URL('./evalWorker.ts', import.meta.url), { type: 'module' })
      w.onmessage = (ev: MessageEvent<WorkerResponse>) => this.onResult(w, ev.data)
      w.onerror = (err) => {
        console.error('worker error', err)
      }
      this.workers.push(w)
      this.idle.push(w)
    }
  }

  get size(): number {
    return this.workers.length
  }

  evaluate(job: EvalJob): Promise<EvalJobResult> {
    return new Promise((resolve, reject) => {
      const jobId = this.nextJobId++
      this.queue.push({ job, resolve, reject, jobId })
      this.pump()
    })
  }

  evaluateBatch(jobs: EvalJob[]): Promise<EvalJobResult[]> {
    return Promise.all(jobs.map((j) => this.evaluate(j)))
  }

  private pump(): void {
    while (this.idle.length > 0 && this.queue.length > 0) {
      const w = this.idle.pop()!
      const item = this.queue.shift()!
      this.inFlight.set(item.jobId, item)
      const req: WorkerRequest = {
        jobId: item.jobId,
        genome: item.job.genome,
        shape: item.job.shape,
        gamesPerFitness: item.job.gamesPerFitness,
        baseSeed: item.job.baseSeed,
        parentA: item.job.parentA,
        parentB: item.job.parentB,
      }
      // Zero-copy: main detaches until worker transfers genome back.
      w.postMessage(req, [item.job.genome.buffer])
    }
  }

  private onResult(worker: Worker, data: WorkerResponse): void {
    const item = this.inFlight.get(data.jobId)
    this.inFlight.delete(data.jobId)
    this.idle.push(worker)
    if (item) {
      item.resolve({
        jobId: data.jobId,
        fitness: data.fitness,
        gameScores: data.gameScores,
        genome: data.genome,
        parentA: item.job.parentA,
        parentB: item.job.parentB,
      })
    }
    this.pump()
  }

  terminate(): void {
    for (const w of this.workers) w.terminate()
    this.workers = []
    this.idle = []
    this.queue = []
    this.inFlight.clear()
  }
}
