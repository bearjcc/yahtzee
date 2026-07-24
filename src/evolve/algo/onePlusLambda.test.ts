import { describe, expect, it } from 'vitest'
import { Archive } from '../archive.ts'
import { DEFAULT_SHARED } from '../params.ts'
import {
  createOnePlusLambda,
  DEFAULT_ONE_PLUS_LAMBDA,
  OnePlusLambda,
} from './onePlusLambda.ts'

function absorb(
  algo: OnePlusLambda,
  archive: Archive,
  genome: Float32Array,
  fitness: number,
  parentA: number | null = null,
  meta?: Record<string, string | number | null>,
) {
  const { bot, pruned } = archive.addEvaluated({
    genome,
    fitness,
    gameScores: [fitness],
    gameSeeds: [1],
    parentA,
    parentB: null,
    meta,
  })
  algo.onEvaluated(bot, pruned)
  return bot
}

describe('OnePlusLambda', () => {
  it('seedBatch returns the requested count', () => {
    const shared = { ...DEFAULT_SHARED }
    const archive = new Archive(shared, 1)
    const algo = new OnePlusLambda()
    algo.configure(shared, { ...DEFAULT_ONE_PLUS_LAMBDA }, archive.shape, 1)
    expect(algo.seedCount()).toBe(8)
    const seeds = algo.seedBatch(5)
    expect(seeds).toHaveLength(5)
    expect(seeds.every((s) => s.parentA === null && s.meta?.origin === 'seed')).toBe(true)
  })

  it('nextBatch children all share the same parentA after champion is set', () => {
    const shared = { ...DEFAULT_SHARED }
    const archive = new Archive(shared, 2)
    const algo = new OnePlusLambda()
    algo.configure(shared, { ...DEFAULT_ONE_PLUS_LAMBDA, seedCount: 3 }, archive.shape, 2)

    const seeds = algo.seedBatch(3)
    const bots = seeds.map((s, i) => absorb(algo, archive, s.genome, 10 + i))
    const champion = bots[2]!
    expect(champion.fitness).toBe(12)

    const batch = algo.nextBatch(4, archive)
    expect(batch).toHaveLength(4)
    expect(batch.every((c) => c.parentA === champion.id)).toBe(true)
    expect(batch.every((c) => c.parentB === null)).toBe(true)
    expect(batch.every((c) => c.meta?.origin === 'mutate')).toBe(true)
    expect(batch.every((c) => c.meta?.champion === champion.id)).toBe(true)
  })

  it('updates champion when a better child is absorbed', () => {
    const shared = { ...DEFAULT_SHARED }
    const archive = new Archive(shared, 3)
    const algo = new OnePlusLambda()
    algo.configure(shared, { ...DEFAULT_ONE_PLUS_LAMBDA, seedCount: 2 }, archive.shape, 3)

    const seeds = algo.seedBatch(2)
    absorb(algo, archive, seeds[0]!.genome, 50)
    const champ = absorb(algo, archive, seeds[1]!.genome, 80)

    const [child] = algo.nextBatch(1, archive)
    expect(child!.parentA).toBe(champ.id)

    const better = absorb(algo, archive, child!.genome, 100, child!.parentA, child!.meta)
    const next = algo.nextBatch(2, archive)
    expect(next.every((c) => c.parentA === better.id)).toBe(true)
    expect(next.every((c) => c.meta?.champion === better.id)).toBe(true)
  })

  it('restore recovers championId', () => {
    const shared = { ...DEFAULT_SHARED }
    const archive = new Archive(shared, 4)
    const algo = new OnePlusLambda()
    algo.configure(shared, { ...DEFAULT_ONE_PLUS_LAMBDA, seedCount: 2 }, archive.shape, 4)

    const seeds = algo.seedBatch(2)
    absorb(algo, archive, seeds[0]!.genome, 20)
    const champ = absorb(algo, archive, seeds[1]!.genome, 40)

    const snap = algo.serialize() as { championId: number | null; params: Record<string, number> }
    expect(snap.championId).toBe(champ.id)

    const restored = createOnePlusLambda() as OnePlusLambda
    restored.configure(shared, snap.params, archive.shape, 99)
    restored.restore(snap, archive)

    const batch = restored.nextBatch(3, archive)
    expect(batch.every((c) => c.parentA === champ.id)).toBe(true)
  })

  it('formatParents shows seed or parent+λ', () => {
    const algo = new OnePlusLambda()
    expect(
      algo.formatParents({
        id: 1,
        fitness: 0,
        gameScores: [],
        parentA: null,
        parentB: null,
        genome: new Float32Array(0),
        meta: {},
      }),
    ).toBe('seed')
    expect(
      algo.formatParents({
        id: 2,
        fitness: 0,
        gameScores: [],
        parentA: 7,
        parentB: null,
        genome: new Float32Array(0),
        meta: {},
      }),
    ).toBe('7+λ')
  })
})
