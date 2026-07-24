import { mulberry32 } from '../../engine/rng.ts'
import { genomeLength, randomGenome, type NetShape } from '../../nn/index.ts'
import type { Archive, BotRecord } from '../archive.ts'
import type { SharedParams } from '../params.ts'
import type { Algorithm, ParamField, TableColumn, TrainCandidate } from './types.ts'

export type CmaEsParams = {
  lambda: number
  mu: number
  sigma: number
  seedCount: number
}

export const DEFAULT_CMA_ES: CmaEsParams = {
  lambda: 16,
  mu: 8,
  sigma: 0.2,
  seedCount: 1,
}

/**
 * Separable CMA-ES (diag C) — O(n), browser-friendly.
 *
 * Sample: x = m + σ D z,  z~N(0,I),  D=sqrt(diag(C))
 * Rank by fitness; weighted recombine top μ (log weights) → m, z_w
 * C_ii ← C_ii * ((1 - c_cov) + c_cov Σ_j w_j z_{j,i}^2)   (rank-μ sep update)
 * p_σ ← (1-c_σ)p_σ + √(c_σ(2-c_σ)μ_eff) z_w
 * σ ← σ * exp((c_σ/d_σ)(||p_σ|| / χ_n - 1))
 * c_cov uses Hansen c_μ scaled ×n for the diagonal (sep-CMA).
 */

function clampCmaEs(raw: Record<string, number>): CmaEsParams {
  const lambda = Math.max(2, Math.floor(raw.lambda ?? DEFAULT_CMA_ES.lambda))
  let mu = Math.max(1, Math.floor(raw.mu ?? DEFAULT_CMA_ES.mu))
  if (mu > lambda) mu = lambda
  return {
    lambda,
    mu,
    sigma: Math.max(1e-8, raw.sigma ?? DEFAULT_CMA_ES.sigma),
    seedCount: Math.max(1, Math.floor(raw.seedCount ?? DEFAULT_CMA_ES.seedCount)),
  }
}

const PARAM_SCHEMA: ParamField[] = [
  { key: 'lambda', label: 'Lambda (offspring)', default: DEFAULT_CMA_ES.lambda, step: '1', integer: true, min: 2 },
  { key: 'mu', label: 'Mu (parents)', default: DEFAULT_CMA_ES.mu, step: '1', integer: true, min: 1 },
  { key: 'sigma', label: 'Initial sigma', default: DEFAULT_CMA_ES.sigma, step: '0.01', min: 0 },
  { key: 'seedCount', label: 'Seed bots', default: DEFAULT_CMA_ES.seedCount, step: '1', integer: true, min: 1 },
]

const TABLE_COLUMNS: TableColumn[] = [
  { key: 'generation', label: 'Gen' },
  { key: 'sample', label: 'Sample' },
]

function logWeights(mu: number): { weights: Float64Array; muEff: number } {
  const raw = new Float64Array(mu)
  let sum = 0
  for (let i = 0; i < mu; i++) {
    raw[i] = Math.log(mu + 0.5) - Math.log(i + 1)
    sum += raw[i]!
  }
  const weights = new Float64Array(mu)
  let sumSq = 0
  for (let i = 0; i < mu; i++) {
    weights[i] = raw[i]! / sum
    sumSq += weights[i]! * weights[i]!
  }
  return { weights, muEff: 1 / sumSq }
}

function randn(rng: () => number): number {
  // Box-Muller
  const u = Math.max(rng(), 1e-12)
  const v = Math.max(rng(), 1e-12)
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

type SeedEval = { genome: Float32Array; fitness: number }
type PendingEval = { z: Float32Array; fitness: number }

type SerializedCmaEs = {
  params?: Partial<CmaEsParams>
  mean?: number[] | null
  diag?: number[] | null
  sigma?: number
  generation?: number
  pSigma?: number[] | null
  initialized?: boolean
}

export class CmaEs implements Algorithm {
  readonly id = 'cmaEs'
  readonly label = 'CMA-ES'
  readonly blurb =
    'Covariance Matrix Adaptation ES for continuous weights. Heavier; best on desktop with smaller nets.'
  readonly paramSchema = PARAM_SCHEMA
  readonly tableColumns = TABLE_COLUMNS

  private params: CmaEsParams = { ...DEFAULT_CMA_ES }
  private shape: NetShape | null = null
  private rng: () => number = () => Math.random()
  private dim = 0

  private mean: Float64Array | null = null
  /** Per-coordinate variance (diag of C). */
  private diag: Float64Array | null = null
  private sigma = DEFAULT_CMA_ES.sigma
  private pSigma: Float64Array | null = null
  private generation = 0
  private initialized = false

  private weights = new Float64Array(0)
  private muEff = 1
  private cSigma = 0
  private dSigma = 0
  private cCov = 0
  private chiN = 0

  private seedEvals: SeedEval[] = []
  private issuedThisGen = 0
  private openZ = new Map<string, Float32Array>()
  private pendingEvals: PendingEval[] = []

  defaultParams(): Record<string, number> {
    return { ...DEFAULT_CMA_ES }
  }

  configure(
    _shared: SharedParams,
    algoParams: Record<string, number>,
    shape: NetShape,
    rngSeed = 42,
  ): void {
    this.params = clampCmaEs(algoParams)
    this.shape = shape
    this.rng = mulberry32(rngSeed)
    this.dim = genomeLength(shape)
    this.sigma = this.params.sigma
    this.mean = null
    this.diag = null
    this.pSigma = null
    this.generation = 0
    this.initialized = false
    this.seedEvals = []
    this.issuedThisGen = 0
    this.openZ.clear()
    this.pendingEvals = []
    this.recomputeRates()
  }

  private recomputeRates(): void {
    const n = Math.max(1, this.dim)
    const { weights, muEff } = logWeights(this.params.mu)
    this.weights = weights
    this.muEff = muEff
    this.cSigma = (muEff + 2) / (n + muEff + 5)
    this.dSigma = 1 + 2 * Math.max(0, Math.sqrt((muEff - 1) / (n + 1)) - 1) + this.cSigma
    // Hansen c_μ, then ×n for separable (only n variance params).
    const cMu =
      Math.min(1, (2 * (muEff - 2 + 1 / muEff)) / ((n + 2) * (n + 2) + muEff)) * n
    this.cCov = Math.min(0.99, Math.max(1 / n, cMu))
    this.chiN = Math.sqrt(n) * (1 - 1 / (4 * n) + 1 / (21 * n * n))
  }

  seedCount(): number {
    return this.params.seedCount
  }

  seedBatch(count: number): TrainCandidate[] {
    if (!this.shape) throw new Error('CmaEs not configured')
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
    if (!this.shape) throw new Error('CmaEs not configured')
    if (!this.initialized) {
      if (archive.bots.length === 0) return this.seedBatch(batchSize)
      this.initFromArchive(archive)
    }
    if (!this.mean || !this.diag) return this.seedBatch(batchSize)

    const take = Math.min(batchSize, this.params.lambda - this.issuedThisGen)
    if (take <= 0) return []

    const out: TrainCandidate[] = []
    const m = this.mean
    const diag = this.diag
    const sigma = this.sigma
    const n = this.dim

    for (let k = 0; k < take; k++) {
      const sample = this.issuedThisGen++
      const z = new Float32Array(n)
      const genome = new Float32Array(n)
      for (let j = 0; j < n; j++) {
        const zj = randn(this.rng)
        z[j] = zj
        const d = Math.sqrt(Math.max(diag[j]!, 1e-20))
        genome[j] = m[j]! + sigma * d * zj
      }
      const key = `${this.generation}:${sample}`
      this.openZ.set(key, z)
      out.push({
        genome,
        parentA: null,
        parentB: null,
        meta: { generation: this.generation, sample, origin: 'cma' },
      })
    }
    return out
  }

  private initFromArchive(archive: Archive): void {
    if (this.seedEvals.length > 0) {
      this.initFromSeedEvals()
      return
    }
    // Fallback: mean = best bot in archive
    let best = archive.bots[0]!
    for (const b of archive.bots) {
      if (b.fitness > best.fitness) best = b
    }
    this.setMeanFromGenome(best.genome)
  }

  private initFromSeedEvals(): void {
    let best = this.seedEvals[0]!
    for (const s of this.seedEvals) {
      if (s.fitness > best.fitness) best = s
    }
    this.setMeanFromGenome(best.genome)
  }

  private setMeanFromGenome(genome: Float32Array): void {
    const n = this.dim
    this.mean = new Float64Array(n)
    this.diag = new Float64Array(n)
    this.pSigma = new Float64Array(n)
    for (let i = 0; i < n; i++) {
      this.mean[i] = genome[i]!
      this.diag[i] = 1
      this.pSigma[i] = 0
    }
    this.sigma = this.params.sigma
    this.generation = 0
    this.issuedThisGen = 0
    this.pendingEvals = []
    this.openZ.clear()
    this.initialized = true
    this.recomputeRates()
  }

  onEvaluated(bot: BotRecord, _pruned: BotRecord[]): void {
    const origin = bot.meta.origin
    const isSeed =
      origin === 'seed' || bot.meta.generation === null || bot.meta.generation === undefined
    if (isSeed) {
      if (!this.initialized) {
        this.seedEvals.push({ genome: bot.genome, fitness: bot.fitness })
        if (this.seedEvals.length >= this.params.seedCount) {
          this.initFromSeedEvals()
        }
      }
      return
    }

    const gen = bot.meta.generation
    const sample = bot.meta.sample
    if (typeof gen !== 'number' || typeof sample !== 'number') return
    if (gen !== this.generation) return

    const key = `${gen}:${sample}`
    const z = this.openZ.get(key)
    if (!z) return
    this.openZ.delete(key)
    this.pendingEvals.push({ z, fitness: bot.fitness })

    if (this.pendingEvals.length >= this.params.lambda) {
      this.updateDistribution()
    }
  }

  private updateDistribution(): void {
    if (!this.mean || !this.diag || !this.pSigma) return
    const lambda = this.params.lambda
    const mu = this.params.mu
    const n = this.dim

    // Rank descending by fitness (maximize).
    const ranked = this.pendingEvals.slice(0, lambda).sort((a, b) => b.fitness - a.fitness)

    const zMean = new Float64Array(n)
    for (let i = 0; i < mu; i++) {
      const w = this.weights[i]!
      const z = ranked[i]!.z
      for (let j = 0; j < n; j++) zMean[j]! += w * z[j]!
    }

    // m ← m + σ D z_w
    for (let j = 0; j < n; j++) {
      const d = Math.sqrt(Math.max(this.diag[j]!, 1e-20))
      this.mean[j]! += this.sigma * d * zMean[j]!
    }

    // Sep rank-μ: C_ii ← C_ii * ((1-c_cov) + c_cov Σ w z^2)
    for (let j = 0; j < n; j++) {
      let wz2 = 0
      for (let i = 0; i < mu; i++) {
        const zj = ranked[i]!.z[j]!
        wz2 += this.weights[i]! * zj * zj
      }
      const next = this.diag[j]! * ((1 - this.cCov) + this.cCov * wz2)
      this.diag[j] = Math.min(1e6, Math.max(1e-12, next))
    }

    // Cumulative step-size adaptation
    const ps = this.pSigma
    const a = 1 - this.cSigma
    const b = Math.sqrt(this.cSigma * (2 - this.cSigma) * this.muEff)
    let psNorm = 0
    for (let j = 0; j < n; j++) {
      ps[j] = a * ps[j]! + b * zMean[j]!
      psNorm += ps[j]! * ps[j]!
    }
    psNorm = Math.sqrt(psNorm)
    this.sigma *= Math.exp((this.cSigma / this.dSigma) * (psNorm / this.chiN - 1))
    this.sigma = Math.min(10, Math.max(1e-8, this.sigma))

    this.pendingEvals = []
    this.issuedThisGen = 0
    this.generation++
  }

  shouldStop(archive: Archive): string | null {
    return archive.shouldStopShared(this.params.seedCount)
  }

  formatParents(bot: BotRecord): string {
    if (bot.meta.origin === 'seed' || bot.meta.generation === null || bot.meta.generation === undefined) {
      return 'seed'
    }
    return `cma g${bot.meta.generation}#${bot.meta.sample}`
  }

  cellValue(bot: BotRecord, columnKey: string): string {
    const v = bot.meta[columnKey]
    return v === null || v === undefined ? '-' : String(v)
  }

  serialize(): unknown {
    return {
      params: { ...this.params },
      mean: this.mean ? Array.from(this.mean) : null,
      diag: this.diag ? Array.from(this.diag) : null,
      sigma: this.sigma,
      generation: this.generation,
      pSigma: this.pSigma ? Array.from(this.pSigma) : null,
      initialized: this.initialized,
    } satisfies SerializedCmaEs
  }

  restore(data: unknown, _archive: Archive): void {
    const d = data as SerializedCmaEs | null
    if (!d) return
    if (d.params) this.params = clampCmaEs({ ...this.params, ...d.params })
    this.sigma = d.sigma ?? this.params.sigma
    this.generation = d.generation ?? 0
    this.initialized = Boolean(d.initialized && d.mean && d.mean.length > 0)
    if (d.mean && d.mean.length > 0) {
      this.dim = d.mean.length
      this.mean = Float64Array.from(d.mean)
      this.diag =
        d.diag && d.diag.length === d.mean.length
          ? Float64Array.from(d.diag)
          : new Float64Array(d.mean.length).fill(1)
      this.pSigma =
        d.pSigma && d.pSigma.length === d.mean.length
          ? Float64Array.from(d.pSigma)
          : new Float64Array(d.mean.length)
      this.initialized = true
    } else {
      this.mean = null
      this.diag = null
      this.pSigma = null
      this.initialized = false
    }
    this.seedEvals = []
    this.issuedThisGen = 0
    this.openZ.clear()
    this.pendingEvals = []
    this.recomputeRates()
  }
}

export function createCmaEs(): Algorithm {
  return new CmaEs()
}
