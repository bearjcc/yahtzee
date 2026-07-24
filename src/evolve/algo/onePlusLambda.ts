import { mulberry32 } from '../../engine/rng.ts'
import { randomGenome, type NetShape } from '../../nn/index.ts'
import type { Archive, BotRecord } from '../archive.ts'
import { mutateCopy } from '../crossover.ts'
import type { SharedParams } from '../params.ts'
import type { Algorithm, ParamField, TableColumn, TrainCandidate } from './types.ts'

export type OnePlusLambdaParams = {
  lambda: number
  pMut: number
  mutSigma: number
  seedCount: number
}

export const DEFAULT_ONE_PLUS_LAMBDA: OnePlusLambdaParams = {
  lambda: 16,
  pMut: 0.02,
  mutSigma: 0.05,
  seedCount: 8,
}

function clampParams(raw: Record<string, number>): OnePlusLambdaParams {
  return {
    lambda: Math.max(1, Math.floor(raw.lambda ?? DEFAULT_ONE_PLUS_LAMBDA.lambda)),
    pMut: Math.max(0, Math.min(1, raw.pMut ?? DEFAULT_ONE_PLUS_LAMBDA.pMut)),
    mutSigma: Math.max(0, raw.mutSigma ?? DEFAULT_ONE_PLUS_LAMBDA.mutSigma),
    seedCount: Math.max(1, Math.floor(raw.seedCount ?? DEFAULT_ONE_PLUS_LAMBDA.seedCount)),
  }
}

function pickBestId(archive: Archive): number | null {
  if (archive.bots.length === 0) return null
  let best = archive.bots[0]!
  for (let i = 1; i < archive.bots.length; i++) {
    const b = archive.bots[i]!
    if (b.fitness > best.fitness) best = b
  }
  return best.id
}

const PARAM_SCHEMA: ParamField[] = [
  {
    key: 'lambda',
    label: 'Lambda (offspring)',
    default: DEFAULT_ONE_PLUS_LAMBDA.lambda,
    step: '1',
    integer: true,
    min: 1,
  },
  {
    key: 'seedCount',
    label: 'Seed bots',
    default: DEFAULT_ONE_PLUS_LAMBDA.seedCount,
    step: '1',
    integer: true,
    min: 1,
  },
  {
    key: 'pMut',
    label: 'Mutation chance',
    default: DEFAULT_ONE_PLUS_LAMBDA.pMut,
    step: '0.0001',
    min: 0,
    max: 1,
  },
  {
    key: 'mutSigma',
    label: 'Mutation sigma',
    default: DEFAULT_ONE_PLUS_LAMBDA.mutSigma,
    step: '0.01',
    min: 0,
  },
]

const TABLE_COLUMNS: TableColumn[] = [
  { key: 'champion', label: 'Champion' },
  { key: 'parentA', label: 'Parent' },
]

export class OnePlusLambda implements Algorithm {
  readonly id = 'onePlusLambda'
  readonly label = '(1+λ) hill-climb'
  readonly blurb =
    'Keep one champion; each batch mutates λ offspring from it; replace champion if a child is better. Fast sanity-check baseline.'
  readonly paramSchema = PARAM_SCHEMA
  readonly tableColumns = TABLE_COLUMNS

  private params: OnePlusLambdaParams = { ...DEFAULT_ONE_PLUS_LAMBDA }
  private shape: NetShape | null = null
  private rng: () => number = () => Math.random()
  private championId: number | null = null
  private championFitness = -Infinity

  defaultParams(): Record<string, number> {
    return { ...DEFAULT_ONE_PLUS_LAMBDA }
  }

  configure(
    _shared: SharedParams,
    algoParams: Record<string, number>,
    shape: NetShape,
    rngSeed = 42,
  ): void {
    this.params = clampParams(algoParams)
    this.shape = shape
    this.rng = mulberry32(rngSeed)
    this.championId = null
    this.championFitness = -Infinity
  }

  seedCount(): number {
    return this.params.seedCount
  }

  seedBatch(count: number): TrainCandidate[] {
    if (!this.shape) throw new Error('OnePlusLambda not configured')
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
    if (!this.shape) throw new Error('OnePlusLambda not configured')
    if (archive.bots.length === 0) return this.seedBatch(batchSize)

    this.ensureChampion(archive)
    const championId = this.championId
    if (championId === null) return this.seedBatch(batchSize)
    const champion = archive.getBot(championId)
    if (!champion) return this.seedBatch(batchSize)

    const out: TrainCandidate[] = []
    for (let i = 0; i < batchSize; i++) {
      out.push({
        genome: mutateCopy(
          champion.genome,
          this.rng,
          this.params.pMut,
          this.params.mutSigma,
        ),
        parentA: championId,
        parentB: null,
        meta: { origin: 'mutate', champion: championId },
      })
    }
    return out
  }

  private ensureChampion(archive: Archive): void {
    if (this.championId !== null && archive.getBot(this.championId)) {
      const live = archive.getBot(this.championId)!
      this.championFitness = live.fitness
      return
    }
    const bestId = pickBestId(archive)
    this.championId = bestId
    if (bestId !== null) {
      this.championFitness = archive.getBot(bestId)!.fitness
    } else {
      this.championFitness = -Infinity
    }
  }

  onEvaluated(bot: BotRecord, pruned: BotRecord[]): void {
    if (this.championId === null || bot.fitness > this.championFitness) {
      this.championId = bot.id
      this.championFitness = bot.fitness
    }

    if (pruned.length > 0 && this.championId !== null) {
      const prunedIds = new Set(pruned.map((p) => p.id))
      if (prunedIds.has(this.championId)) {
        this.championId = null
        this.championFitness = -Infinity
      }
    }
  }

  shouldStop(archive: Archive): string | null {
    return archive.shouldStopShared(this.params.seedCount)
  }

  formatParents(bot: BotRecord): string {
    if (bot.parentA === null) return 'seed'
    return `${bot.parentA}+λ`
  }

  cellValue(bot: BotRecord, columnKey: string): string {
    if (columnKey === 'parentA') return bot.parentA === null ? '-' : String(bot.parentA)
    if (columnKey === 'champion') {
      const v = bot.meta.champion
      return v === null || v === undefined ? '-' : String(v)
    }
    const v = bot.meta[columnKey]
    return v === null || v === undefined ? '-' : String(v)
  }

  serialize(): unknown {
    return {
      params: this.params,
      championId: this.championId,
    }
  }

  restore(data: unknown, archive: Archive): void {
    const d = data as {
      params?: Partial<OnePlusLambdaParams>
      championId?: number | null
    } | null
    if (d?.params) this.params = clampParams({ ...this.params, ...d.params })
    this.championId = d?.championId ?? null
    if (this.championId !== null) {
      const live = archive.getBot(this.championId)
      this.championFitness = live ? live.fitness : -Infinity
      if (!live) this.championId = null
    } else {
      this.championFitness = -Infinity
    }
  }
}

export function createOnePlusLambda(): Algorithm {
  return new OnePlusLambda()
}
