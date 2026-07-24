import { mulberry32 } from '../engine/rng.ts'
import {
  defaultShape,
  genomeLength,
  INPUT_SIZE,
  OUTPUT_SIZE,
  type NetShape,
} from '../nn/index.ts'
import { DEFAULT_SHARED, type SharedParams } from './params.ts'

export interface BotRecord {
  id: number
  fitness: number
  gameScores: number[]
  /** Per-game RNG seeds used for fitness; may be absent on legacy checkpoints. */
  gameSeeds?: number[]
  parentA: number | null
  parentB: number | null
  genome: Float32Array
  meta: Record<string, string | number | null>
  /** Legacy lottery tickets (Leaderboard genetics / old checkpoints). */
  tickets?: number
}

export type AddEvaluatedResult = {
  bot: BotRecord
  pruned: BotRecord[]
}

export class Archive {
  bots: BotRecord[] = []
  private byId = new Map<number, BotRecord>()
  nextId = 1
  shape: NetShape
  shared: SharedParams
  bestFitness = -Infinity
  bestId = 0
  botsSinceBestImprove = 0
  rng: () => number

  constructor(shared: SharedParams = DEFAULT_SHARED, seed = 42) {
    this.shared = shared
    this.shape = defaultShape(INPUT_SIZE, OUTPUT_SIZE, shared.hidden1, shared.hidden2)
    this.rng = mulberry32(seed)
  }

  get genomeBytes(): number {
    return genomeLength(this.shape) * 4
  }

  /** @deprecated Use `shared` — kept for call sites during migration. */
  get params(): SharedParams {
    return this.shared
  }

  reset(shared: SharedParams, seed = 42): void {
    this.shared = shared
    this.shape = defaultShape(INPUT_SIZE, OUTPUT_SIZE, shared.hidden1, shared.hidden2)
    this.bots = []
    this.byId.clear()
    this.nextId = 1
    this.bestFitness = -Infinity
    this.bestId = 0
    this.botsSinceBestImprove = 0
    this.rng = mulberry32(seed)
  }

  getBot(id: number): BotRecord | undefined {
    return this.byId.get(id)
  }

  addEvaluated(opts: {
    genome: Float32Array
    fitness: number
    gameScores: number[]
    gameSeeds: number[]
    parentA: number | null
    parentB: number | null
    meta?: Record<string, string | number | null>
    tickets?: number
  }): AddEvaluatedResult {
    const id = this.nextId++
    const bot: BotRecord = {
      id,
      fitness: opts.fitness,
      gameScores: opts.gameScores,
      gameSeeds: opts.gameSeeds,
      parentA: opts.parentA,
      parentB: opts.parentB,
      genome: opts.genome,
      meta: opts.meta ?? {},
      tickets: opts.tickets,
    }
    this.bots.push(bot)
    this.byId.set(id, bot)

    if (opts.fitness > this.bestFitness) {
      this.bestFitness = opts.fitness
      this.bestId = id
      this.botsSinceBestImprove = 0
    } else {
      this.botsSinceBestImprove++
    }

    const pruned = this.pruneIfNeeded()
    return { bot, pruned }
  }

  pruneIfNeeded(): BotRecord[] {
    const max = this.shared.maxBots
    const pruned: BotRecord[] = []
    while (this.bots.length > max) {
      let worstIdx = 0
      let worstFit = this.bots[0]!.fitness
      let worstId = this.bots[0]!.id
      for (let i = 1; i < this.bots.length; i++) {
        const b = this.bots[i]!
        if (b.fitness < worstFit || (b.fitness === worstFit && b.id < worstId)) {
          worstIdx = i
          worstFit = b.fitness
          worstId = b.id
        }
      }
      const worst = this.bots[worstIdx]!
      const last = this.bots.length - 1
      this.bots[worstIdx] = this.bots[last]!
      this.bots.pop()
      this.byId.delete(worst.id)
      pruned.push(worst)
    }
    return pruned
  }

  /** Shared stop criteria (algo may add more via shouldStop). */
  shouldStopShared(minCreatedForStagnation = 0): string | null {
    const p = this.shared
    const created = this.nextId - 1
    if (p.endMaxBots > 0 && created >= p.endMaxBots) return `Reached endMaxBots (${p.endMaxBots})`
    if (p.endTargetScore > 0 && this.bestFitness >= p.endTargetScore) {
      return `Reached target score ${p.endTargetScore}`
    }
    if (
      p.endStagnation > 0 &&
      created >= minCreatedForStagnation &&
      this.botsSinceBestImprove >= p.endStagnation
    ) {
      return `Stagnation (${p.endStagnation} bots without improvement)`
    }
    return null
  }

  serializeBots(): Array<{
    id: number
    fitness: number
    gameScores: number[]
    gameSeeds?: number[]
    parentA: number | null
    parentB: number | null
    tickets?: number
    meta: Record<string, string | number | null>
    genome: number[]
  }> {
    return this.bots.map((b) => ({
      id: b.id,
      fitness: b.fitness,
      gameScores: b.gameScores,
      gameSeeds: b.gameSeeds,
      parentA: b.parentA,
      parentB: b.parentB,
      tickets: b.tickets,
      meta: b.meta,
      genome: Array.from(b.genome),
    }))
  }

  loadBots(
    bots: Array<{
      id: number
      fitness: number
      gameScores: number[]
      gameSeeds?: number[]
      parentA: number | null
      parentB: number | null
      tickets?: number
      meta?: Record<string, string | number | null>
      genome: number[]
    }>,
  ): void {
    this.bots = []
    this.byId.clear()
    for (const b of bots) {
      const bot: BotRecord = {
        id: b.id,
        fitness: b.fitness,
        gameScores: b.gameScores,
        gameSeeds: b.gameSeeds,
        parentA: b.parentA,
        parentB: b.parentB,
        tickets: b.tickets,
        meta: b.meta ?? {},
        genome: Float32Array.from(b.genome),
      }
      this.bots.push(bot)
      this.byId.set(bot.id, bot)
    }
  }
}

/** @deprecated Prefer Archive — alias for older imports. */
export { Archive as Population }
