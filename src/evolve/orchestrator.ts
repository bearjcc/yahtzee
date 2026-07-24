import { Population } from './population.ts'
import type { EvolveParams } from './params.ts'
import { WorkerPool } from '../workers/pool.ts'
import type { BotRecord } from './population.ts'

export type OrchEvent =
  | { type: 'log'; line: string }
  | { type: 'bot'; bot: BotRecord }
  | { type: 'status'; running: boolean; reason?: string }
  | { type: 'stats'; created: number; best: number; bestId: number; popSize: number }

export class Orchestrator {
  pop: Population
  private pool: WorkerPool | null = null
  private running = false
  private paused = false
  private listeners: Array<(e: OrchEvent) => void> = []

  constructor(params: EvolveParams) {
    this.pop = new Population(params)
  }

  on(fn: (e: OrchEvent) => void): () => void {
    this.listeners.push(fn)
    return () => {
      this.listeners = this.listeners.filter((x) => x !== fn)
    }
  }

  private emit(e: OrchEvent): void {
    for (const fn of this.listeners) fn(e)
  }

  private log(line: string): void {
    this.emit({ type: 'log', line })
  }

  configure(params: EvolveParams): void {
    if (this.running) return
    this.pop.reset(params)
  }

  async start(): Promise<void> {
    if (this.running) return
    this.running = true
    this.paused = false
    this.pool = new WorkerPool()
    this.emit({ type: 'status', running: true })
    this.log(`Run start - workers ${this.pool.size}, seeds ${this.pop.params.seedCount}`)

    try {
      if (this.pop.bots.length === 0) {
        await this.seedWave()
      }
      while (this.running && !this.paused) {
        const stop = this.pop.shouldStop()
        if (stop) {
          this.log(`Stop: ${stop}`)
          this.emit({ type: 'status', running: false, reason: stop })
          this.running = false
          break
        }
        await this.childBatch()
        await yieldToUi()
      }
    } catch (err) {
      this.log(`Error: ${err instanceof Error ? err.message : String(err)}`)
      this.emit({ type: 'status', running: false, reason: 'error' })
      this.running = false
    } finally {
      this.pool?.terminate()
      this.pool = null
      if (this.running && this.paused) {
        this.emit({ type: 'status', running: false, reason: 'paused' })
        this.running = false
      }
    }
  }

  pause(): void {
    this.paused = true
    this.running = false
    this.log('Paused')
    this.emit({ type: 'status', running: false, reason: 'paused' })
  }

  private async seedWave(): Promise<void> {
    const p = this.pop.params
    const jobs = []
    for (let i = 0; i < p.seedCount; i++) {
      const genome = this.pop.makeSeedGenome()
      jobs.push({
        genome,
        shape: this.pop.shape,
        gamesPerFitness: p.gamesPerFitness,
        baseSeed: (i * 7919 + 1) >>> 0,
        parentA: null as number | null,
        parentB: null as number | null,
      })
    }
    this.log(`Evaluating ${jobs.length} seed bots...`)
    const results = await this.pool!.evaluateBatch(jobs)
    results.sort((a, b) => a.jobId - b.jobId)
    for (const r of results) {
      const bot = this.pop.addEvaluated({
        genome: r.genome,
        fitness: r.fitness,
        gameScores: r.gameScores,
        parentA: null,
        parentB: null,
      })
      this.emitBot(bot)
    }
  }

  private async childBatch(): Promise<void> {
    const p = this.pop.params
    const n = Math.max(1, p.batchSize)
    const jobs = []
    for (let i = 0; i < n; i++) {
      if (this.pop.shouldStop()) break
      const { genome, parentA, parentB } = this.pop.makeChildGenome()
      const provisionalId = this.pop.nextId + i
      jobs.push({
        genome,
        shape: this.pop.shape,
        gamesPerFitness: p.gamesPerFitness,
        baseSeed: (provisionalId * 104729) >>> 0,
        parentA,
        parentB,
      })
    }
    if (jobs.length === 0) return
    const results = await this.pool!.evaluateBatch(jobs)
    results.sort((a, b) => a.jobId - b.jobId)
    for (const r of results) {
      if (!this.running) break
      const bot = this.pop.addEvaluated({
        genome: r.genome,
        fitness: r.fitness,
        gameScores: r.gameScores,
        parentA: r.parentA,
        parentB: r.parentB,
      })
      this.emitBot(bot)
      const stop = this.pop.shouldStop()
      if (stop) {
        this.log(`Stop: ${stop}`)
        this.running = false
        this.emit({ type: 'status', running: false, reason: stop })
        break
      }
    }
  }

  private emitBot(bot: BotRecord): void {
    const games = bot.gameScores.join('/')
    const parents =
      bot.parentA === null ? 'seed' : `${bot.parentA}x${bot.parentB}`
    this.log(
      `bot ${bot.id}  score ${bot.fitness.toFixed(1)}  parents ${parents}  games ${games}`,
    )
    this.emit({ type: 'bot', bot })
    this.emit({
      type: 'stats',
      created: this.pop.nextId - 1,
      best: this.pop.bestFitness,
      bestId: this.pop.bestId,
      popSize: this.pop.bots.length,
    })
  }
}

function yieldToUi(): Promise<void> {
  return new Promise((r) => setTimeout(r, 0))
}
