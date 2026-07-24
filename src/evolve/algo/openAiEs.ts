import { mulberry32, type Rng } from '../../engine/rng.ts'
import { genomeLength, randomGenome, type NetShape } from '../../nn/index.ts'
import type { Archive, BotRecord } from '../archive.ts'
import type { SharedParams } from '../params.ts'
import type { Algorithm, ParamField, TableColumn, TrainCandidate } from './types.ts'

export type OpenAiEsParams = {
  population: number
  sigma: number
  learningRate: number
  seedCount: number
}

export const DEFAULT_OPENAI_ES: OpenAiEsParams = {
  population: 32,
  sigma: 0.02,
  learningRate: 0.01,
  seedCount: 1,
}

/** Clamp to even integer >= 2. */
export function clampEvenPopulation(raw: number): number {
  let p = Math.floor(Number.isFinite(raw) ? raw : DEFAULT_OPENAI_ES.population)
  if (p < 2) p = 2
  if (p % 2 !== 0) p -= 1
  if (p < 2) p = 2
  return p
}

function clampOpenAiEs(raw: Record<string, number>): OpenAiEsParams {
  return {
    population: clampEvenPopulation(raw.population ?? DEFAULT_OPENAI_ES.population),
    sigma: Math.max(1e-12, raw.sigma ?? DEFAULT_OPENAI_ES.sigma),
    learningRate: Math.max(0, raw.learningRate ?? DEFAULT_OPENAI_ES.learningRate),
    seedCount: Math.max(1, Math.floor(raw.seedCount ?? DEFAULT_OPENAI_ES.seedCount)),
  }
}

const PARAM_SCHEMA: ParamField[] = [
  {
    key: 'population',
    label: 'Population (even)',
    default: DEFAULT_OPENAI_ES.population,
    step: '2',
    integer: true,
    min: 2,
  },
  { key: 'sigma', label: 'Sigma', default: DEFAULT_OPENAI_ES.sigma, step: '0.001', min: 0 },
  {
    key: 'learningRate',
    label: 'Learning rate',
    default: DEFAULT_OPENAI_ES.learningRate,
    step: '0.001',
    min: 0,
  },
  {
    key: 'seedCount',
    label: 'Seed bots',
    default: DEFAULT_OPENAI_ES.seedCount,
    step: '1',
    integer: true,
    min: 1,
  },
]

const TABLE_COLUMNS: TableColumn[] = [
  { key: 'generation', label: 'Gen' },
  { key: 'noiseIndex', label: 'Noise #' },
  { key: 'antithetic', label: 'Sign' },
]

/** Box-Muller standard normal. */
function gaussian(rng: Rng): number {
  const u = Math.max(rng(), 1e-9)
  const v = Math.max(rng(), 1e-9)
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

function sampleNoise(len: number, rng: Rng): Float32Array {
  const eps = new Float32Array(len)
  for (let i = 0; i < len; i++) eps[i] = gaussian(rng)
  return eps
}

function perturb(center: Float32Array, noise: Float32Array, sigma: number, sign: 1 | -1): Float32Array {
  const g = new Float32Array(center.length)
  for (let i = 0; i < center.length; i++) {
    g[i] = center[i]! + sign * sigma * noise[i]!
  }
  return g
}

/** Centered ranks in [-0.5, 0.5]; best fitness gets +0.5. */
function centeredRankUtilities(fitnesses: number[]): Float32Array {
  const n = fitnesses.length
  const order = Array.from({ length: n }, (_, i) => i)
  order.sort((a, b) => fitnesses[a]! - fitnesses[b]!)
  const ranks = new Float32Array(n)
  for (let r = 0; r < n; r++) ranks[order[r]!] = r
  const u = new Float32Array(n)
  const denom = Math.max(1, n - 1)
  for (let i = 0; i < n; i++) u[i] = ranks[i]! / denom - 0.5
  return u
}

type PendingSlot = {
  noiseIndex: number
  antithetic: 1 | -1
  fitness: number | null
}

export class OpenAiEs implements Algorithm {
  readonly id = 'openAiEs'
  readonly label = 'OpenAI-ES'
  readonly blurb =
    'antithetic evolution strategies — sample noise pairs around a centre genome, rank fitness, update centre with weighted noise. Parallel-friendly.'
  readonly paramSchema = PARAM_SCHEMA
  readonly tableColumns = TABLE_COLUMNS

  private params: OpenAiEsParams = { ...DEFAULT_OPENAI_ES }
  private shape: NetShape | null = null
  private rng: () => number = () => Math.random()

  private center: Float32Array | null = null
  private generation = 0

  /** Noise vectors for the current generation, keyed by noiseIndex. */
  private noises = new Map<number, Float32Array>()
  private nextNoiseIndex = 0
  private emittedThisGen = 0
  private pending: PendingSlot[] = []
  private seedsSeen = 0
  private bestSeedFitness = -Infinity

  defaultParams(): Record<string, number> {
    return { ...DEFAULT_OPENAI_ES }
  }

  configure(
    _shared: SharedParams,
    algoParams: Record<string, number>,
    shape: NetShape,
    rngSeed = 42,
  ): void {
    this.params = clampOpenAiEs(algoParams)
    this.shape = shape
    this.rng = mulberry32(rngSeed)
    this.center = null
    this.generation = 0
    this.noises.clear()
    this.nextNoiseIndex = 0
    this.emittedThisGen = 0
    this.pending = []
    this.seedsSeen = 0
    this.bestSeedFitness = -Infinity
  }

  seedCount(): number {
    return this.params.seedCount
  }

  seedBatch(count: number): TrainCandidate[] {
    if (!this.shape) throw new Error('OpenAiEs not configured')
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
    if (!this.shape) throw new Error('OpenAiEs not configured')
    if (!this.center) {
      if (archive.bots.length === 0) return this.seedBatch(Math.max(1, batchSize))
      this.initCenterFromArchive(archive)
    }

    const remaining = this.params.population - this.emittedThisGen
    if (remaining <= 0) {
      // Waiting for evaluations of the current generation.
      return []
    }

    const pairs = Math.min(Math.floor(batchSize / 2), Math.floor(remaining / 2))
    if (pairs <= 0) return []

    const center = this.center!
    const sigma = this.params.sigma
    const gen = this.generation
    const out: TrainCandidate[] = []

    for (let p = 0; p < pairs; p++) {
      const noiseIndex = this.nextNoiseIndex++
      const eps = sampleNoise(center.length, this.rng)
      this.noises.set(noiseIndex, eps)

      for (const antithetic of [1, -1] as const) {
        out.push({
          genome: perturb(center, eps, sigma, antithetic),
          parentA: null,
          parentB: null,
          meta: {
            origin: 'es',
            generation: gen,
            noiseIndex,
            antithetic,
          },
        })
        this.pending.push({ noiseIndex, antithetic, fitness: null })
      }
      this.emittedThisGen += 2
    }

    return out
  }

  onEvaluated(bot: BotRecord, _pruned: BotRecord[]): void {
    if (bot.meta.origin === 'seed' || bot.meta.generation === undefined || bot.meta.generation === null) {
      this.onSeedEvaluated(bot)
      return
    }

    const noiseIndex = Number(bot.meta.noiseIndex)
    const antithetic = Number(bot.meta.antithetic) as 1 | -1
    const slot = this.pending.find(
      (s) => s.noiseIndex === noiseIndex && s.antithetic === antithetic && s.fitness === null,
    )
    if (!slot) return
    slot.fitness = bot.fitness

    if (this.pendingReady()) this.applyUpdate()
  }

  private onSeedEvaluated(bot: BotRecord): void {
    this.seedsSeen++
    if (!this.center || bot.fitness > this.bestSeedFitness) {
      this.center = new Float32Array(bot.genome)
      this.bestSeedFitness = bot.fitness
    }
  }

  private pendingReady(): boolean {
    if (this.emittedThisGen < this.params.population) return false
    if (this.pending.length < this.params.population) return false
    return this.pending.every((s) => s.fitness !== null)
  }

  private applyUpdate(): void {
    if (!this.center) return
    const n = this.pending.length
    if (n < 2 || n % 2 !== 0) return

    const fitnesses = this.pending.map((s) => s.fitness!)
    const utilities = centeredRankUtilities(fitnesses)
    const sigma = this.params.sigma
    const lr = this.params.learningRate
    const scale = lr / (n * sigma)
    const center = this.center

    for (let i = 0; i < n; i++) {
      const slot = this.pending[i]!
      const eps = this.noises.get(slot.noiseIndex)
      if (!eps) continue
      const u = utilities[i]!
      const sign = slot.antithetic
      // Signed noise ε_i = antithetic * ε
      for (let j = 0; j < center.length; j++) {
        center[j]! += scale * u * sign * eps[j]!
      }
    }

    this.noises.clear()
    this.nextNoiseIndex = 0
    this.emittedThisGen = 0
    this.pending = []
    this.generation++
  }

  private initCenterFromArchive(archive: Archive): void {
    let best = archive.bots[0]!
    for (let i = 1; i < archive.bots.length; i++) {
      const b = archive.bots[i]!
      if (b.fitness > best.fitness) best = b
    }
    this.center = new Float32Array(best.genome)
    this.bestSeedFitness = best.fitness
  }

  shouldStop(archive: Archive): string | null {
    return archive.shouldStopShared(this.params.seedCount)
  }

  formatParents(bot: BotRecord): string {
    if (bot.meta.origin === 'seed' || bot.meta.generation === undefined || bot.meta.generation === null) {
      return 'seed'
    }
    const gen = bot.meta.generation
    const i = bot.meta.noiseIndex
    const sign = Number(bot.meta.antithetic) >= 0 ? '+' : '-'
    return `es g${gen} n${i}${sign}`
  }

  cellValue(bot: BotRecord, columnKey: string): string {
    const v = bot.meta[columnKey]
    if (v === null || v === undefined) return '-'
    if (columnKey === 'antithetic') {
      const n = Number(v)
      if (n > 0) return '+1'
      if (n < 0) return '-1'
    }
    return String(v)
  }

  serialize(): unknown {
    return {
      params: this.params,
      center: this.center ? Array.from(this.center) : null,
      generation: this.generation,
    }
  }

  restore(data: unknown, archive: Archive): void {
    const d = data as {
      params?: Partial<OpenAiEsParams>
      center?: number[] | null
      generation?: number
    } | null
    if (d?.params) this.params = clampOpenAiEs({ ...this.params, ...d.params })
    if (d?.center && d.center.length > 0) {
      this.center = Float32Array.from(d.center)
    } else if (archive.bots.length > 0) {
      this.initCenterFromArchive(archive)
    } else {
      this.center = null
    }
    this.generation = d?.generation ?? 0
    this.noises.clear()
    this.nextNoiseIndex = 0
    this.emittedThisGen = 0
    this.pending = []
    this.seedsSeen = this.params.seedCount
    this.bestSeedFitness = archive.bots.reduce((m, b) => Math.max(m, b.fitness), -Infinity)
    // Ensure shape length matches if configured.
    if (this.shape && this.center && this.center.length !== genomeLength(this.shape)) {
      this.center = null
      if (archive.bots.length > 0) this.initCenterFromArchive(archive)
    }
  }
}

export function createOpenAiEs(): Algorithm {
  return new OpenAiEs()
}
