import { DEFAULT_GAME_IDS, normalizeGameIds, type GameId } from '../games/types.ts'
import { defaultShape, genomeLength, INPUT_SIZE, OUTPUT_SIZE } from '../nn/index.ts'
import { WorkerPool } from '../workers/pool.ts'
import { Archive, type BotRecord } from './archive.ts'
import { getAlgorithm, DEFAULT_ALGORITHM_ID } from './algo/registry.ts'
import type { Algorithm, RunConfig, TrainCandidate } from './algo/types.ts'
import { buildMultiGameSeeds, cryptoUnit } from './evaluate.ts'
import {
  DEFAULT_PARAMS,
  DEFAULT_SHARED,
  leaderboardAsRecord,
  pickLeaderboard,
  pickShared,
  type EvolveParams,
  type SharedParams,
} from './params.ts'

export type OrchEvent =
  | { type: 'log'; line: string }
  | { type: 'bot'; bot: BotRecord }
  | { type: 'status'; running: boolean; reason?: string }
  | { type: 'stats'; created: number; best: number; bestId: number; popSize: number }

export type CheckpointV3 = {
  version: 3
  algorithmId: string
  gameIds: GameId[]
  shared: SharedParams
  algoParams: Record<string, number>
  algoState: unknown
  nextId: number
  bestFitness: number
  bestId: number
  botsSinceBestImprove: number
  bots: ReturnType<Archive['serializeBots']>
}

/** @deprecated Migrated to CheckpointV3 on load. */
export type CheckpointV2 = {
  version: 2
  algorithmId: string
  shared: SharedParams
  algoParams: Record<string, number>
  algoState: unknown
  nextId: number
  bestFitness: number
  bestId: number
  botsSinceBestImprove: number
  bots: ReturnType<Archive['serializeBots']>
}

export class Orchestrator {
  /** Bot archive (UI + checkpoints). */
  archive: Archive
  /** @deprecated Prefer `archive`. */
  get pop(): Archive {
    return this.archive
  }

  algorithm: Algorithm
  gameIds: GameId[]
  shared: SharedParams
  algoParams: Record<string, number>

  private pool: WorkerPool | null = null
  private running = false
  private paused = false
  private listeners: Array<(e: OrchEvent) => void> = []
  private batchSharedCounter = 0

  constructor(config?: Partial<RunConfig> | EvolveParams) {
    const run = normalizeConfig(config)
    this.shared = run.shared
    this.algoParams = run.algoParams
    this.gameIds = run.gameIds
    this.algorithm = getAlgorithm(run.algorithmId)
    this.archive = new Archive(this.shared)
    this.algorithm.configure(this.shared, this.algoParams, this.archive.shape)
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

  configure(config: Partial<RunConfig> | EvolveParams): void {
    if (this.running) return
    const run = normalizeConfig(config)
    this.shared = run.shared
    this.algoParams = run.algoParams
    this.gameIds = run.gameIds
    this.algorithm = getAlgorithm(run.algorithmId)
    this.archive.reset(this.shared)
    this.algorithm.configure(this.shared, this.algoParams, this.archive.shape)
    this.batchSharedCounter = 0
  }

  private nextSharedBase(): number {
    this.batchSharedCounter++
    return (this.batchSharedCounter * 2654435761) >>> 0
  }

  /** Same shared suite for every job in a batch; private half differs per bot. */
  private makeBatchJobSeeds(batchSize: number): number[][] {
    const p = this.shared
    const sharedBase = this.nextSharedBase()
    const out: number[][] = []
    for (let i = 0; i < batchSize; i++) {
      out.push(
        buildMultiGameSeeds(
          this.gameIds,
          p.gamesPerFitness,
          p.sharedGameFraction,
          sharedBase,
          cryptoUnit,
        ),
      )
    }
    return out
  }

  async start(): Promise<void> {
    if (this.running) return
    this.running = true
    this.paused = false
    this.pool = new WorkerPool()
    this.emit({ type: 'status', running: true })
    this.log(
      `Run start - games ${this.gameIds.join('+')}, algo ${this.algorithm.label}, workers ${this.pool.size}, seeds ${this.algorithm.seedCount()}`,
    )

    try {
      if (this.archive.bots.length === 0) {
        await this.seedWave()
      }
      while (this.running && !this.paused) {
        const stop = this.algorithm.shouldStop(this.archive)
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

  private async evaluateCandidates(candidates: TrainCandidate[]): Promise<void> {
    if (candidates.length === 0) return
    const seedLists = this.makeBatchJobSeeds(candidates.length)
    const jobs = candidates.map((c, i) => ({
      genome: c.genome,
      shape: this.archive.shape,
      gameSeeds: seedLists[i]!,
      fitnessStdPenalty: this.shared.fitnessStdPenalty,
      gameIds: this.gameIds,
      parentA: c.parentA,
      parentB: c.parentB,
    }))
    const metas = candidates.map((c) => c.meta ?? {})
    const results = await this.pool!.evaluateBatch(jobs)
    results.sort((a, b) => a.jobId - b.jobId)
    for (let i = 0; i < results.length; i++) {
      if (!this.running) break
      const r = results[i]!
      const { bot, pruned } = this.archive.addEvaluated({
        genome: r.genome,
        fitness: r.fitness,
        gameScores: r.gameScores,
        gameSeeds: r.gameSeeds,
        parentA: r.parentA,
        parentB: r.parentB,
        meta: metas[i] ?? {},
      })
      this.algorithm.onEvaluated(bot, pruned)
      this.emitBot(bot)
      const stop = this.algorithm.shouldStop(this.archive)
      if (stop) {
        this.log(`Stop: ${stop}`)
        this.running = false
        this.emit({ type: 'status', running: false, reason: stop })
        break
      }
    }
  }

  private async seedWave(): Promise<void> {
    const n = this.algorithm.seedCount()
    const candidates = this.algorithm.seedBatch(n)
    this.log(`Evaluating ${candidates.length} seed bots...`)
    await this.evaluateCandidates(candidates)
  }

  private async childBatch(): Promise<void> {
    let take = Math.max(1, this.shared.batchSize)
    if (this.shared.endMaxBots > 0) {
      const created = this.archive.nextId - 1
      const left = this.shared.endMaxBots - created
      if (left <= 0) return
      take = Math.min(take, left)
    }
    const candidates = this.algorithm.nextBatch(take, this.archive)
    if (candidates.length === 0) return
    await this.evaluateCandidates(candidates)
  }

  private emitBot(bot: BotRecord): void {
    const games = bot.gameScores.join('/')
    const parents = this.algorithm.formatParents(bot)
    this.log(
      `bot ${bot.id}  score ${bot.fitness.toFixed(1)}  parents ${parents}  games ${games}`,
    )
    this.emit({ type: 'bot', bot })
    this.emit({
      type: 'stats',
      created: this.archive.nextId - 1,
      best: this.archive.bestFitness,
      bestId: this.archive.bestId,
      popSize: this.archive.bots.length,
    })
  }

  serialize(): CheckpointV3 {
    return {
      version: 3,
      algorithmId: this.algorithm.id,
      gameIds: this.gameIds,
      shared: this.shared,
      algoParams: this.algoParams,
      algoState: this.algorithm.serialize(),
      nextId: this.archive.nextId,
      bestFitness: this.archive.bestFitness,
      bestId: this.archive.bestId,
      botsSinceBestImprove: this.archive.botsSinceBestImprove,
      bots: this.archive.serializeBots(),
    }
  }

  loadSerialized(data: CheckpointV3 | CheckpointV2 | LegacyCheckpoint | Record<string, unknown>): void {
    if (this.running) this.pause()
    const normalized = migrateCheckpoint(data)
    this.shared = normalized.shared
    this.algoParams = normalized.algoParams
    this.gameIds = normalized.gameIds
    this.algorithm = getAlgorithm(normalized.algorithmId)
    this.archive.reset(this.shared)
    this.archive.nextId = normalized.nextId
    this.archive.bestFitness = normalized.bestFitness
    this.archive.bestId = normalized.bestId
    this.archive.botsSinceBestImprove = normalized.botsSinceBestImprove
    const expectedLen = genomeLength(this.archive.shape)
    const compatible = normalized.bots.filter((b) => b.genome.length === expectedLen)
    this.archive.loadBots(compatible)
    if (compatible.length !== normalized.bots.length) {
      this.log(
        `Dropped ${normalized.bots.length - compatible.length} bots with incompatible genome shape`,
      )
    }
    this.algorithm.configure(this.shared, this.algoParams, this.archive.shape)
    this.algorithm.restore(normalized.algoState, this.archive)
    this.batchSharedCounter = 0
  }
}

type LegacyCheckpoint = {
  params: EvolveParams
  nextId: number
  bestFitness: number
  bestId: number
  botsSinceBestImprove: number
  bots: Array<{
    id: number
    fitness: number
    gameScores: number[]
    gameSeeds?: number[]
    parentA: number | null
    parentB: number | null
    tickets?: number
    genome: number[]
  }>
}

function isLegacyCheckpoint(data: unknown): data is LegacyCheckpoint {
  if (typeof data !== 'object' || data === null || !('params' in data)) return false
  if ('version' in data) {
    const v = (data as { version?: number }).version
    if (v === 2 || v === 3) return false
  }
  return true
}

function migrateCheckpoint(data: unknown): CheckpointV3 {
  if (typeof data === 'object' && data !== null && 'version' in data) {
    const version = (data as { version?: number }).version
    if (version === 3) {
      const v3 = data as CheckpointV3
      return {
        ...v3,
        gameIds: normalizeGameIds(v3.gameIds),
        shared: { ...DEFAULT_SHARED, ...v3.shared },
        algoParams: { ...v3.algoParams },
        algorithmId: v3.algorithmId || DEFAULT_ALGORITHM_ID,
      }
    }
    if (version === 2) {
      const v2 = data as CheckpointV2
      return {
        version: 3,
        algorithmId: v2.algorithmId || DEFAULT_ALGORITHM_ID,
        gameIds: [...DEFAULT_GAME_IDS],
        shared: { ...DEFAULT_SHARED, ...v2.shared },
        algoParams: { ...v2.algoParams },
        algoState: v2.algoState,
        nextId: v2.nextId,
        bestFitness: v2.bestFitness,
        bestId: v2.bestId,
        botsSinceBestImprove: v2.botsSinceBestImprove,
        bots: v2.bots,
      }
    }
  }
  if (isLegacyCheckpoint(data)) {
    const params = { ...DEFAULT_PARAMS, ...data.params }
    const lb = pickLeaderboard(params)
    return {
      version: 3,
      algorithmId: DEFAULT_ALGORITHM_ID,
      gameIds: [...DEFAULT_GAME_IDS],
      shared: pickShared(params),
      algoParams: leaderboardAsRecord(lb),
      algoState: { params: lb },
      nextId: data.nextId,
      bestFitness: data.bestFitness,
      bestId: data.bestId,
      botsSinceBestImprove: data.botsSinceBestImprove,
      bots: data.bots.map((b) => ({ ...b, meta: {} })),
    }
  }
  throw new Error('Unrecognized checkpoint format')
}

function normalizeConfig(config?: Partial<RunConfig> | EvolveParams): RunConfig {
  if (!config) {
    return {
      algorithmId: DEFAULT_ALGORITHM_ID,
      gameIds: [...DEFAULT_GAME_IDS],
      shared: { ...DEFAULT_SHARED },
      algoParams: leaderboardAsRecord(pickLeaderboard(DEFAULT_PARAMS)),
    }
  }
  if ('shared' in config || 'algorithmId' in config || 'algoParams' in config || 'gameIds' in config) {
    const c = config as Partial<RunConfig>
    const shared = { ...DEFAULT_SHARED, ...c.shared }
    defaultShape(INPUT_SIZE, OUTPUT_SIZE, shared.hidden1, shared.hidden2)
    return {
      algorithmId: c.algorithmId ?? DEFAULT_ALGORITHM_ID,
      gameIds: normalizeGameIds(c.gameIds),
      shared,
      algoParams: { ...(c.algoParams ?? leaderboardAsRecord(pickLeaderboard(DEFAULT_PARAMS))) },
    }
  }
  const flat = { ...DEFAULT_PARAMS, ...(config as EvolveParams) }
  return {
    algorithmId: DEFAULT_ALGORITHM_ID,
    gameIds: [...DEFAULT_GAME_IDS],
    shared: pickShared(flat),
    algoParams: leaderboardAsRecord(pickLeaderboard(flat)),
  }
}

function yieldToUi(): Promise<void> {
  return new Promise((r) => setTimeout(r, 0))
}
