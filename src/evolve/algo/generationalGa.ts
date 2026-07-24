import { mulberry32 } from '../../engine/rng.ts'
import { randomGenome, type NetShape } from '../../nn/index.ts'
import type { Archive, BotRecord } from '../archive.ts'
import { crossoverAndMutate, mutateCopy } from '../crossover.ts'
import type { SharedParams } from '../params.ts'
import type { Algorithm, ParamField, TableColumn, TrainCandidate } from './types.ts'

export type GenerationalGaParams = {
  popSize: number
  eliteCount: number
  tournamentSize: number
  pMut: number
  mutSigma: number
  pCrossover: number
}

export const DEFAULT_GENERATIONAL_GA: GenerationalGaParams = {
  popSize: 80,
  eliteCount: 4,
  tournamentSize: 3,
  pMut: 0.01,
  mutSigma: 0.05,
  pCrossover: 0.7,
}

function clampGenerationalGa(raw: Record<string, number>): GenerationalGaParams {
  const popSize = Math.max(2, Math.floor(raw.popSize ?? DEFAULT_GENERATIONAL_GA.popSize))
  const eliteCount = Math.min(
    popSize - 1,
    Math.max(0, Math.floor(raw.eliteCount ?? DEFAULT_GENERATIONAL_GA.eliteCount)),
  )
  return {
    popSize,
    eliteCount,
    tournamentSize: Math.max(
      1,
      Math.floor(raw.tournamentSize ?? DEFAULT_GENERATIONAL_GA.tournamentSize),
    ),
    pMut: Math.max(0, Math.min(1, raw.pMut ?? DEFAULT_GENERATIONAL_GA.pMut)),
    mutSigma: Math.max(0, raw.mutSigma ?? DEFAULT_GENERATIONAL_GA.mutSigma),
    pCrossover: Math.max(0, Math.min(1, raw.pCrossover ?? DEFAULT_GENERATIONAL_GA.pCrossover)),
  }
}

const PARAM_SCHEMA: ParamField[] = [
  {
    key: 'popSize',
    label: 'Population size',
    default: DEFAULT_GENERATIONAL_GA.popSize,
    step: '1',
    integer: true,
    min: 2,
  },
  {
    key: 'eliteCount',
    label: 'Elite count',
    default: DEFAULT_GENERATIONAL_GA.eliteCount,
    step: '1',
    integer: true,
    min: 0,
  },
  {
    key: 'tournamentSize',
    label: 'Tournament size',
    default: DEFAULT_GENERATIONAL_GA.tournamentSize,
    step: '1',
    integer: true,
    min: 1,
  },
  {
    key: 'pMut',
    label: 'Mutation chance',
    default: DEFAULT_GENERATIONAL_GA.pMut,
    step: '0.0001',
    min: 0,
    max: 1,
  },
  {
    key: 'mutSigma',
    label: 'Mutation sigma',
    default: DEFAULT_GENERATIONAL_GA.mutSigma,
    step: '0.01',
    min: 0,
  },
  {
    key: 'pCrossover',
    label: 'Crossover chance',
    default: DEFAULT_GENERATIONAL_GA.pCrossover,
    step: '0.01',
    min: 0,
    max: 1,
  },
]

const TABLE_COLUMNS: TableColumn[] = [
  { key: 'generation', label: 'Generation' },
  { key: 'parentA', label: 'Parent A' },
  { key: 'parentB', label: 'Parent B' },
]

type SerializedState = {
  params?: Partial<GenerationalGaParams>
  generation?: number
  childrenProposed?: number
  childrenEvaluated?: number
  childrenTarget?: number
  breedingActive?: boolean
  poolIds?: number[]
  eliteIds?: number[]
  pendingChildIds?: number[]
}

export class GenerationalGa implements Algorithm {
  readonly id = 'generationalGa'
  readonly label = 'Generational GA'
  readonly blurb =
    'Fixed-size population with elitism, tournament selection, and true generations. Seeds fill the first generation; each later generation keeps elites and replaces the rest via crossover/mutation.'
  readonly paramSchema = PARAM_SCHEMA
  readonly tableColumns = TABLE_COLUMNS

  private params: GenerationalGaParams = { ...DEFAULT_GENERATIONAL_GA }
  private shape: NetShape | null = null
  private rng: () => number = () => Math.random()

  /** Generation number stamped on children currently being produced (0 = seeds only). */
  private generation = 0
  private childrenProposed = 0
  private childrenEvaluated = 0
  private childrenTarget = 0
  private breedingActive = false
  /** Current generation member ids (breeding pool). */
  private poolIds: number[] = []
  private eliteIds: number[] = []
  private pendingChildIds: number[] = []

  defaultParams(): Record<string, number> {
    return { ...DEFAULT_GENERATIONAL_GA }
  }

  configure(
    _shared: SharedParams,
    algoParams: Record<string, number>,
    shape: NetShape,
    rngSeed = 42,
  ): void {
    this.params = clampGenerationalGa(algoParams)
    this.shape = shape
    this.rng = mulberry32(rngSeed)
    this.generation = 0
    this.childrenProposed = 0
    this.childrenEvaluated = 0
    this.childrenTarget = 0
    this.breedingActive = false
    this.poolIds = []
    this.eliteIds = []
    this.pendingChildIds = []
  }

  seedCount(): number {
    return this.params.popSize
  }

  seedBatch(count: number): TrainCandidate[] {
    if (!this.shape) throw new Error('GenerationalGa not configured')
    const out: TrainCandidate[] = []
    for (let i = 0; i < count; i++) {
      out.push({
        genome: randomGenome(this.shape, this.rng),
        parentA: null,
        parentB: null,
        meta: { origin: 'seed', generation: 0 },
      })
    }
    return out
  }

  nextBatch(batchSize: number, archive: Archive): TrainCandidate[] {
    if (!this.shape) throw new Error('GenerationalGa not configured')
    if (archive.bots.length === 0) return this.seedBatch(batchSize)

    this.beginGenerationIfNeeded(archive)
    const remaining = this.childrenTarget - this.childrenProposed
    if (remaining <= 0) return []

    const take = Math.min(batchSize, remaining)
    const out: TrainCandidate[] = []
    for (let i = 0; i < take; i++) {
      out.push(this.makeChild(archive))
      this.childrenProposed++
    }
    return out
  }

  private beginGenerationIfNeeded(archive: Archive): void {
    this.pruneStateIds(archive)
    if (this.poolIds.length === 0) {
      this.poolIds = archive.bots.map((b) => b.id)
    }
    if (this.breedingActive) return

    this.generation += 1
    this.eliteIds = this.pickElites(archive)
    for (const id of this.eliteIds) {
      const bot = archive.getBot(id)
      if (!bot) continue
      bot.meta = { ...bot.meta, origin: 'elite', generation: this.generation }
    }
    this.childrenTarget = Math.max(0, this.params.popSize - this.eliteIds.length)
    this.childrenProposed = 0
    this.childrenEvaluated = 0
    this.pendingChildIds = []
    this.breedingActive = true
  }

  private pickElites(archive: Archive): number[] {
    const members = this.poolMembers(archive)
    members.sort((a, b) => b.fitness - a.fitness || b.id - a.id)
    const n = Math.min(this.params.eliteCount, members.length)
    return members.slice(0, n).map((b) => b.id)
  }

  private poolMembers(archive: Archive): BotRecord[] {
    const out: BotRecord[] = []
    for (const id of this.poolIds) {
      const bot = archive.getBot(id)
      if (bot) out.push(bot)
    }
    if (out.length === 0) {
      return [...archive.bots]
    }
    return out
  }

  private makeChild(archive: Archive): TrainCandidate {
    if (this.rng() < this.params.pCrossover) {
      const parentA = this.tournamentSelect(archive)
      const parentB = this.tournamentSelect(archive)
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
        meta: { origin: 'crossover', generation: this.generation },
      }
    }
    const parentA = this.tournamentSelect(archive)
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
      meta: { origin: 'mutate', generation: this.generation },
    }
  }

  /** Tournament selection over the current generation pool (via archive lookups). */
  private tournamentSelect(archive: Archive): number {
    const members = this.poolMembers(archive)
    if (members.length === 0) throw new Error('GenerationalGa: empty breeding pool')
    const t = Math.min(this.params.tournamentSize, members.length)
    let best = members[Math.floor(this.rng() * members.length)]!
    for (let i = 1; i < t; i++) {
      const cand = members[Math.floor(this.rng() * members.length)]!
      if (cand.fitness > best.fitness || (cand.fitness === best.fitness && cand.id > best.id)) {
        best = cand
      }
    }
    return best.id
  }

  onEvaluated(bot: BotRecord, pruned: BotRecord[]): void {
    if (pruned.length > 0) {
      const gone = new Set(pruned.map((p) => p.id))
      this.poolIds = this.poolIds.filter((id) => !gone.has(id))
      this.eliteIds = this.eliteIds.filter((id) => !gone.has(id))
      this.pendingChildIds = this.pendingChildIds.filter((id) => !gone.has(id))
    }

    if (!this.breedingActive) return

    const origin = bot.meta.origin
    if (origin === 'crossover' || origin === 'mutate') {
      this.pendingChildIds.push(bot.id)
      this.childrenEvaluated++
    }

    if (this.childrenEvaluated >= this.childrenTarget && this.childrenProposed >= this.childrenTarget) {
      this.poolIds = [...this.eliteIds, ...this.pendingChildIds]
      this.eliteIds = []
      this.pendingChildIds = []
      this.childrenProposed = 0
      this.childrenEvaluated = 0
      this.childrenTarget = 0
      this.breedingActive = false
    }
  }

  shouldStop(archive: Archive): string | null {
    return archive.shouldStopShared(this.params.popSize)
  }

  formatParents(bot: BotRecord): string {
    if (bot.meta.origin === 'elite') {
      const g = bot.meta.generation
      return `gen${g === null || g === undefined ? '?' : g} elite`
    }
    if (bot.parentA === null) return 'seed'
    if (bot.parentB === null) return `${bot.parentA}mut`
    return `${bot.parentA}x${bot.parentB}`
  }

  cellValue(bot: BotRecord, columnKey: string): string {
    if (columnKey === 'parentA') return bot.parentA === null ? '-' : String(bot.parentA)
    if (columnKey === 'parentB') return bot.parentB === null ? '-' : String(bot.parentB)
    if (columnKey === 'generation') {
      const v = bot.meta.generation
      return v === null || v === undefined ? '-' : String(v)
    }
    const v = bot.meta[columnKey]
    return v === null || v === undefined ? '-' : String(v)
  }

  serialize(): unknown {
    return {
      params: this.params,
      generation: this.generation,
      childrenProposed: this.childrenProposed,
      childrenEvaluated: this.childrenEvaluated,
      childrenTarget: this.childrenTarget,
      breedingActive: this.breedingActive,
      poolIds: [...this.poolIds],
      eliteIds: [...this.eliteIds],
      pendingChildIds: [...this.pendingChildIds],
    } satisfies SerializedState
  }

  restore(data: unknown, archive: Archive): void {
    const d = (data as SerializedState | null) ?? {}
    if (d.params) this.params = clampGenerationalGa({ ...this.params, ...d.params })
    this.generation = Math.max(0, Math.floor(d.generation ?? 0))
    this.childrenProposed = Math.max(0, Math.floor(d.childrenProposed ?? 0))
    this.childrenEvaluated = Math.max(0, Math.floor(d.childrenEvaluated ?? 0))
    this.childrenTarget = Math.max(0, Math.floor(d.childrenTarget ?? 0))
    this.breedingActive = Boolean(d.breedingActive)
    this.poolIds = Array.isArray(d.poolIds) ? d.poolIds.map((x) => Number(x)) : []
    this.eliteIds = Array.isArray(d.eliteIds) ? d.eliteIds.map((x) => Number(x)) : []
    this.pendingChildIds = Array.isArray(d.pendingChildIds)
      ? d.pendingChildIds.map((x) => Number(x))
      : []
    this.rebuildFromArchive(archive)
  }

  private rebuildFromArchive(archive: Archive): void {
    this.pruneStateIds(archive)
    if (this.poolIds.length === 0 && archive.bots.length > 0) {
      // Prefer bots stamped with the current generation; else most recent popSize.
      const genBots = archive.bots.filter((b) => b.meta.generation === this.generation)
      if (genBots.length > 0) {
        this.poolIds = genBots.map((b) => b.id)
      } else {
        const sorted = [...archive.bots].sort((a, b) => b.id - a.id)
        this.poolIds = sorted.slice(0, this.params.popSize).map((b) => b.id)
      }
    }
  }

  private pruneStateIds(archive: Archive): void {
    const alive = (id: number) => archive.getBot(id) !== undefined
    this.poolIds = this.poolIds.filter(alive)
    this.eliteIds = this.eliteIds.filter(alive)
    this.pendingChildIds = this.pendingChildIds.filter(alive)
  }
}

export function createGenerationalGa(): Algorithm {
  return new GenerationalGa()
}
