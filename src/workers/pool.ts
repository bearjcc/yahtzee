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

export type EvalJobResult = WorkerResponse

type Pending = {
  resolve: (r: EvalJobResult) => void
  reject: (e: unknown) => void
}

export class WorkerPool {
  private workers: Worker[] = []
  private idle: Worker[] = []
  private queue: Array<{ job: EvalJob; pending: Pending; jobId: number }> = []
  private pending = new Map<number, Pending>()
  private nextJobId = 1

  constructor(size = Math.max(1, navigator.hardwareConcurrency || 4)) {
    const n = Math.min(size, 8)
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
      const pending = { resolve, reject }
      this.pending.set(jobId, pending)
      this.queue.push({ job, pending, jobId })
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
      const req: WorkerRequest = {
        jobId: item.jobId,
        genome: item.job.genome,
        shape: item.job.shape,
        gamesPerFitness: item.job.gamesPerFitness,
        baseSeed: item.job.baseSeed,
        parentA: item.job.parentA,
        parentB: item.job.parentB,
      }
      w.postMessage(req)
    }
  }

  private onResult(worker: Worker, data: WorkerResponse): void {
    const p = this.pending.get(data.jobId)
    this.pending.delete(data.jobId)
    this.idle.push(worker)
    if (p) p.resolve(data)
    this.pump()
  }

  terminate(): void {
    for (const w of this.workers) w.terminate()
    this.workers = []
    this.idle = []
    this.queue = []
    this.pending.clear()
  }
}
