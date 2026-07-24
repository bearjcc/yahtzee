import { describe, expect, it } from 'vitest'
import { INPUT_SIZE, OUTPUT_SIZE, defaultShape } from '../../nn/index.ts'
import { Archive } from '../archive.ts'
import { DEFAULT_SHARED } from '../params.ts'
import {
  OpenAiEs,
  clampEvenPopulation,
  createOpenAiEs,
  DEFAULT_OPENAI_ES,
} from './openAiEs.ts'

function tinyShape() {
  return defaultShape(INPUT_SIZE, OUTPUT_SIZE, 4, 3)
}

function configured(algoParams: Record<string, number> = {}): OpenAiEs {
  const algo = new OpenAiEs()
  algo.configure(DEFAULT_SHARED, { ...DEFAULT_OPENAI_ES, ...algoParams }, tinyShape(), 7)
  return algo
}

function fakeBot(
  genome: Float32Array,
  fitness: number,
  meta: Record<string, string | number | null>,
) {
  return {
    id: 1,
    fitness,
    gameScores: [],
    parentA: null as number | null,
    parentB: null as number | null,
    genome,
    meta,
  }
}

describe('OpenAiEs', () => {
  it('clamps population to even >= 2', () => {
    expect(clampEvenPopulation(32)).toBe(32)
    expect(clampEvenPopulation(33)).toBe(32)
    expect(clampEvenPopulation(3)).toBe(2)
    expect(clampEvenPopulation(1)).toBe(2)
    expect(clampEvenPopulation(0)).toBe(2)
    expect(clampEvenPopulation(-4)).toBe(2)

    const algo = configured({ population: 17 })
    expect(algo.defaultParams().population).toBe(32)
    const ser = algo.serialize() as { params: { population: number } }
    expect(ser.params.population).toBe(16)
  })

  it('nextBatch returns antithetic pairs with opposite antithetic meta', () => {
    const algo = configured({ population: 4, seedCount: 1 })
    const archive = new Archive({ ...DEFAULT_SHARED, hidden1: 4, hidden2: 3 })
    const seeds = algo.seedBatch(1)
    expect(seeds).toHaveLength(1)
    algo.onEvaluated(fakeBot(seeds[0]!.genome, 100, seeds[0]!.meta!), [])

    const batch = algo.nextBatch(4, archive)
    expect(batch.length).toBe(4)
    expect(batch.length % 2).toBe(0)

    for (let i = 0; i < batch.length; i += 2) {
      const a = batch[i]!
      const b = batch[i + 1]!
      expect(a.meta!.noiseIndex).toBe(b.meta!.noiseIndex)
      expect(a.meta!.generation).toBe(0)
      expect(b.meta!.generation).toBe(0)
      expect(a.meta!.antithetic).toBe(1)
      expect(b.meta!.antithetic).toBe(-1)
      expect(a.meta!.antithetic).not.toBe(b.meta!.antithetic)
    }
  })

  it('after absorbing a full set centre moves (not identical)', () => {
    const algo = configured({ population: 4, sigma: 0.1, learningRate: 0.5, seedCount: 1 })
    const archive = new Archive({ ...DEFAULT_SHARED, hidden1: 4, hidden2: 3 })
    const seeds = algo.seedBatch(1)
    algo.onEvaluated(fakeBot(seeds[0]!.genome, 50, seeds[0]!.meta!), [])

    const before = (algo.serialize() as { center: number[] }).center.slice()

    const batch = algo.nextBatch(4, archive)
    expect(batch).toHaveLength(4)

    // Distinct fitnesses so centered ranks are non-zero.
    const fitnesses = [10, 40, 20, 30]
    for (let i = 0; i < batch.length; i++) {
      const c = batch[i]!
      algo.onEvaluated(fakeBot(c.genome, fitnesses[i]!, c.meta!), [])
    }

    const after = (algo.serialize() as { center: number[] }).center
    expect(after.length).toBe(before.length)
    let moved = false
    for (let i = 0; i < after.length; i++) {
      if (after[i] !== before[i]) {
        moved = true
        break
      }
    }
    expect(moved).toBe(true)
  })

  it('serialize includes center length', () => {
    const algo = configured({ population: 4, seedCount: 1 })
    const seeds = algo.seedBatch(1)
    algo.onEvaluated(fakeBot(seeds[0]!.genome, 12, seeds[0]!.meta!), [])

    const raw = algo.serialize() as { center: number[] | null; generation: number; params: object }
    expect(raw.center).not.toBeNull()
    expect(raw.center!.length).toBe(seeds[0]!.genome.length)
    expect(raw.center!.length).toBeGreaterThan(0)
    expect(typeof raw.generation).toBe('number')
  })

  it('createOpenAiEs factory and identity', () => {
    const algo = createOpenAiEs()
    expect(algo.id).toBe('openAiEs')
    expect(algo.label).toBe('OpenAI-ES')
    expect(algo.blurb.toLowerCase()).toContain('antithetic')
  })

  it('formatParents shows seed or es label', () => {
    const algo = configured()
    expect(
      algo.formatParents(
        fakeBot(new Float32Array(2), 0, { origin: 'seed' }),
      ),
    ).toBe('seed')
    expect(
      algo.formatParents(
        fakeBot(new Float32Array(2), 0, {
          origin: 'es',
          generation: 3,
          noiseIndex: 2,
          antithetic: -1,
        }),
      ),
    ).toBe('es g3 n2-')
  })
})
