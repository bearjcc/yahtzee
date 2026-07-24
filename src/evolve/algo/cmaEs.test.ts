import { describe, expect, it } from 'vitest'
import { Archive } from '../archive.ts'
import { DEFAULT_SHARED } from '../params.ts'
import { CmaEs, createCmaEs, DEFAULT_CMA_ES } from './cmaEs.ts'
import type { BotRecord } from '../archive.ts'

const tinyShape = { inputSize: 4, hidden1: 3, hidden2: 2, outputSize: 2 }

function makeBot(partial: Partial<BotRecord> & Pick<BotRecord, 'genome' | 'fitness'>): BotRecord {
  return {
    id: partial.id ?? 1,
    fitness: partial.fitness,
    gameScores: partial.gameScores ?? [partial.fitness],
    parentA: partial.parentA ?? null,
    parentB: partial.parentB ?? null,
    genome: partial.genome,
    meta: partial.meta ?? {},
  }
}

describe('CmaEs', () => {
  it('clamps lambda and mu (mu <= lambda)', () => {
    const algo = new CmaEs()
    algo.configure(DEFAULT_SHARED, { lambda: 4, mu: 8, sigma: 0.2, seedCount: 1 }, tinyShape, 1)
    const p = algo.defaultParams()
    expect(p.lambda).toBe(DEFAULT_CMA_ES.lambda)
    // configure clamps into internal params via next serialize
    const s = algo.serialize() as { params: { lambda: number; mu: number } }
    expect(s.params.lambda).toBe(4)
    expect(s.params.mu).toBe(4)

    algo.configure(DEFAULT_SHARED, { lambda: 1.2, mu: 0, sigma: -1, seedCount: 0 }, tinyShape, 1)
    const s2 = algo.serialize() as { params: { lambda: number; mu: number; sigma: number; seedCount: number } }
    expect(s2.params.lambda).toBe(2)
    expect(s2.params.mu).toBe(1)
    expect(s2.params.sigma).toBeGreaterThan(0)
    expect(s2.params.seedCount).toBe(1)
  })

  it('nextBatch returns up to batchSize with generation/sample meta', () => {
    const algo = new CmaEs()
    algo.configure(DEFAULT_SHARED, { lambda: 16, mu: 8, sigma: 0.2, seedCount: 1 }, tinyShape, 7)
    const archive = new Archive({ ...DEFAULT_SHARED, maxBots: 100 }, 7)

    const seeds = algo.seedBatch(1)
    expect(seeds).toHaveLength(1)
    const seedBot = makeBot({
      id: 1,
      genome: seeds[0]!.genome,
      fitness: 10,
      meta: seeds[0]!.meta ?? {},
    })
    archive.bots.push(seedBot)
    algo.onEvaluated(seedBot, [])

    const batch = algo.nextBatch(5, archive)
    expect(batch).toHaveLength(5)
    for (let i = 0; i < batch.length; i++) {
      const c = batch[i]!
      expect(c.meta?.generation).toBe(0)
      expect(c.meta?.sample).toBe(i)
      expect(c.genome.length).toBeGreaterThan(0)
      expect(algo.formatParents(makeBot({ genome: c.genome, fitness: 0, meta: c.meta ?? {} }))).toBe(
        `cma g0#${i}`,
      )
    }
    expect(algo.formatParents(seedBot)).toBe('seed')
  })

  it('updates mean after a full generation of onEvaluated', () => {
    const algo = new CmaEs()
    const lambda = 8
    const mu = 4
    algo.configure(DEFAULT_SHARED, { lambda, mu, sigma: 0.3, seedCount: 1 }, tinyShape, 99)
    const archive = new Archive({ ...DEFAULT_SHARED, maxBots: 200 }, 99)

    const seeds = algo.seedBatch(1)
    const seedBot = makeBot({
      id: 1,
      genome: seeds[0]!.genome,
      fitness: 50,
      meta: seeds[0]!.meta ?? {},
    })
    archive.bots.push(seedBot)
    algo.onEvaluated(seedBot, [])

    const before = algo.serialize() as { mean: number[]; sigma: number; generation: number }
    expect(before.mean).toBeTruthy()
    expect(before.generation).toBe(0)
    const meanBefore = before.mean.slice()

    const candidates = algo.nextBatch(lambda, archive)
    expect(candidates).toHaveLength(lambda)

    for (let i = 0; i < candidates.length; i++) {
      const c = candidates[i]!
      const bot = makeBot({
        id: i + 2,
        genome: c.genome,
        fitness: i === 0 ? 100 : 10 + i, // first sample best
        meta: c.meta ?? {},
      })
      algo.onEvaluated(bot, [])
    }

    const after = algo.serialize() as { mean: number[]; sigma: number; generation: number }
    expect(after.generation).toBe(1)
    let changed = false
    for (let i = 0; i < meanBefore.length; i++) {
      if (Math.abs(meanBefore[i]! - after.mean[i]!) > 1e-12) {
        changed = true
        break
      }
    }
    expect(changed).toBe(true)
  })

  it('serialize/restore restores sigma and mean length', () => {
    const algo = new CmaEs()
    algo.configure(DEFAULT_SHARED, { lambda: 6, mu: 3, sigma: 0.15, seedCount: 1 }, tinyShape, 3)
    const archive = new Archive({ ...DEFAULT_SHARED, maxBots: 50 }, 3)

    const seeds = algo.seedBatch(1)
    const seedBot = makeBot({
      id: 1,
      genome: seeds[0]!.genome,
      fitness: 20,
      meta: seeds[0]!.meta ?? {},
    })
    algo.onEvaluated(seedBot, [])

    const snap = algo.serialize() as {
      mean: number[]
      sigma: number
      generation: number
      params: { lambda: number }
    }
    expect(snap.mean.length).toBeGreaterThan(0)
    expect(snap.sigma).toBeCloseTo(0.15)

    const other = createCmaEs() as CmaEs
    other.configure(DEFAULT_SHARED, { lambda: 6, mu: 3, sigma: 0.9, seedCount: 1 }, tinyShape, 3)
    other.restore(snap, archive)

    const restored = other.serialize() as { mean: number[]; sigma: number; generation: number }
    expect(restored.sigma).toBeCloseTo(0.15)
    expect(restored.mean.length).toBe(snap.mean.length)
    expect(restored.generation).toBe(snap.generation)
    for (let i = 0; i < snap.mean.length; i++) {
      expect(restored.mean[i]).toBeCloseTo(snap.mean[i]!, 5)
    }
  })
})
