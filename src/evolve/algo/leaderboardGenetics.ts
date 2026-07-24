import { mulberry32 } from '../../engine/rng.ts'
import { randomGenome, type NetShape } from '../../nn/index.ts'
import type { Archive, BotRecord } from '../archive.ts'
import { crossoverAndMutate, mutateCopy } from '../crossover.ts'
import { Lottery, ticketsForScore } from '../lottery.ts'
import {
  DEFAULT_LEADERBOARD,
  type LeaderboardParams,
  type SharedParams,
} from '../params.ts'
import type { Algorithm, ParamField, TableColumn, TrainCandidate } from './types.ts'

function clampLeaderboard(raw: Record<string, number>): LeaderboardParams {
  return {
    k: Math.min(2, Math.max(1, raw.k ?? DEFAULT_LEADERBOARD.k)),
    seedCount: Math.max(1, Math.floor(raw.seedCount ?? DEFAULT_LEADERBOARD.seedCount)),
    pMut: Math.max(0, Math.min(1, raw.pMut ?? DEFAULT_LEADERBOARD.pMut)),
    mutSigma: Math.max(0, raw.mutSigma ?? DEFAULT_LEADERBOARD.mutSigma),
    pCrossover: Math.max(0, Math.min(1, raw.pCrossover ?? DEFAULT_LEADERBOARD.pCrossover)),
  }
}

const PARAM_SCHEMA: ParamField[] = [
  { key: 'k', label: 'Lottery k (1-2)', default: DEFAULT_LEADERBOARD.k, step: '0.05', min: 1, max: 2 },
  { key: 'seedCount', label: 'Seed bots', default: DEFAULT_LEADERBOARD.seedCount, step: '1', integer: true, min: 1 },
  { key: 'pMut', label: 'Mutation chance', default: DEFAULT_LEADERBOARD.pMut, step: '0.0001', min: 0, max: 1 },
  { key: 'mutSigma', label: 'Mutation sigma', default: DEFAULT_LEADERBOARD.mutSigma, step: '0.01', min: 0 },
  {
    key: 'pCrossover',
    label: 'Crossover chance',
    default: DEFAULT_LEADERBOARD.pCrossover,
    step: '0.01',
    min: 0,
    max: 1,
  },
]

const TABLE_COLUMNS: TableColumn[] = [
  { key: 'parentA', label: 'Parent A' },
  { key: 'parentB', label: 'Parent B' },
]

export class LeaderboardGenetics implements Algorithm {
  readonly id = 'leaderboardGenetics'
  readonly label = 'Leaderboard genetics'
  readonly blurb =
    'You start with random seed nets. Most children are asexual: one lottery parent, then mutate. Sometimes two parents crossover. Parents are drawn by lottery: tickets = score^k (k between 1 and 2). Nobody is culled until you hit max bots.'
  readonly paramSchema = PARAM_SCHEMA
  readonly tableColumns = TABLE_COLUMNS

  private params: LeaderboardParams = { ...DEFAULT_LEADERBOARD }
  private shape: NetShape | null = null
  private lottery = new Lottery(DEFAULT_LEADERBOARD.k)
  private rng: () => number = () => Math.random()

  defaultParams(): Record<string, number> {
    return { ...DEFAULT_LEADERBOARD }
  }

  configure(
    _shared: SharedParams,
    algoParams: Record<string, number>,
    shape: NetShape,
    rngSeed = 42,
  ): void {
    this.params = clampLeaderboard(algoParams)
    this.shape = shape
    this.lottery = new Lottery(this.params.k)
    this.rng = mulberry32(rngSeed)
  }

  seedCount(): number {
    return this.params.seedCount
  }

  seedBatch(count: number): TrainCandidate[] {
    if (!this.shape) throw new Error('LeaderboardGenetics not configured')
    const out: TrainCandidate[] = []
    for (let i = 0; i < count; i++) {
      out.push({
        genome: randomGenome(this.shape, this.rng),
        parentA: null,
        parentB: null,
        meta: { origin: 'seed' },
      })
    }
    return out
  }

  nextBatch(batchSize: number, archive: Archive): TrainCandidate[] {
    if (!this.shape) throw new Error('LeaderboardGenetics not configured')
    if (archive.bots.length === 0) return this.seedBatch(batchSize)
    const out: TrainCandidate[] = []
    for (let i = 0; i < batchSize; i++) {
      out.push(this.makeChild(archive))
    }
    return out
  }

  private makeChild(archive: Archive): TrainCandidate {
    if (this.rng() < this.params.pCrossover) {
      const parentA = this.lottery.draw(this.rng)
      const parentB = this.lottery.draw(this.rng)
      const a = archive.getBot(parentA)!.genome
      const b = archive.getBot(parentB)!.genome
      const genome = crossoverAndMutate(
        a,
        b,
        this.rng,
        this.params.pMut,
        this.params.mutSigma,
      )
      return {
        genome,
        parentA,
        parentB,
        meta: { origin: 'crossover' },
      }
    }
    const parentA = this.lottery.draw(this.rng)
    const genome = mutateCopy(
      archive.getBot(parentA)!.genome,
      this.rng,
      this.params.pMut,
      this.params.mutSigma,
    )
    return {
      genome,
      parentA,
      parentB: null,
      meta: { origin: 'mutate' },
    }
  }

  onEvaluated(bot: BotRecord, pruned: BotRecord[]): void {
    bot.tickets = ticketsForScore(bot.fitness, this.params.k)
    this.lottery.add(bot.id, bot.fitness)
    if (pruned.length > 0) {
      this.lottery.removeIds(new Set(pruned.map((p) => p.id)))
    }
  }

  shouldStop(archive: Archive): string | null {
    return archive.shouldStopShared(this.params.seedCount)
  }

  formatParents(bot: BotRecord): string {
    if (bot.parentA === null) return 'seed'
    if (bot.parentB === null) return `${bot.parentA}mut`
    return `${bot.parentA}x${bot.parentB}`
  }

  cellValue(bot: BotRecord, columnKey: string): string {
    if (columnKey === 'parentA') return bot.parentA === null ? '-' : String(bot.parentA)
    if (columnKey === 'parentB') return bot.parentB === null ? '-' : String(bot.parentB)
    const v = bot.meta[columnKey]
    return v === null || v === undefined ? '-' : String(v)
  }

  serialize(): unknown {
    return {
      params: this.params,
      lotterySize: this.lottery.size,
    }
  }

  restore(data: unknown, archive: Archive): void {
    const d = data as { params?: Partial<LeaderboardParams> } | null
    if (d?.params) this.params = clampLeaderboard({ ...this.params, ...d.params })
    this.lottery = new Lottery(this.params.k)
    this.lottery.rebuildFromScores(archive.bots.map((b) => ({ id: b.id, score: b.fitness })))
  }
}

export function createLeaderboardGenetics(): Algorithm {
  return new LeaderboardGenetics()
}
