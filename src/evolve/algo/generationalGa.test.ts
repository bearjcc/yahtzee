import { describe, expect, it } from 'vitest'
import { Archive } from '../archive.ts'
import { DEFAULT_SHARED } from '../params.ts'
import {
  DEFAULT_GENERATIONAL_GA,
  GenerationalGa,
  createGenerationalGa,
} from './generationalGa.ts'

function seedArchive(
  algo: GenerationalGa,
  archive: Archive,
  n: number,
  fitnessBase = 100,
): void {
  const seeds = algo.seedBatch(n)
  for (let i = 0; i < seeds.length; i++) {
    const seed = seeds[i]!
    const { bot, pruned } = archive.addEvaluated({
      genome: seed.genome,
      fitness: fitnessBase + i,
      gameScores: [fitnessBase + i],
      gameSeeds: [i + 1],
      parentA: null,
      parentB: null,
      meta: seed.meta,
    })
    algo.onEvaluated(bot, pruned)
  }
}

describe('GenerationalGa', () => {
  it('defaultParams exposes expected keys', () => {
    const algo = createGenerationalGa()
    const keys = Object.keys(algo.defaultParams()).sort()
    expect(keys).toEqual(
      ['eliteCount', 'mutSigma', 'pCrossover', 'pMut', 'popSize', 'tournamentSize'].sort(),
    )
    expect(algo.defaultParams()).toEqual(DEFAULT_GENERATIONAL_GA)
    expect(algo.id).toBe('generationalGa')
    expect(algo.label).toBe('Generational GA')
  })

  it('asexual path when pCrossover=0 yields parentB null', () => {
    const shared = { ...DEFAULT_SHARED, maxBots: 200 }
    const archive = new Archive(shared, 1)
    const algo = new GenerationalGa()
    algo.configure(
      shared,
      { ...DEFAULT_GENERATIONAL_GA, popSize: 6, eliteCount: 2, pCrossover: 0 },
      archive.shape,
      1,
    )
    seedArchive(algo, archive, algo.seedCount())
    const child = algo.nextBatch(1, archive)[0]!
    expect(child.parentA).toBeGreaterThan(0)
    expect(child.parentB).toBeNull()
    expect(child.meta?.origin).toBe('mutate')
    expect(archive.getBot(child.parentA!) ).toBeTruthy()
  })

  it('tournament produces valid parent ids from seeded archive', () => {
    const shared = { ...DEFAULT_SHARED, maxBots: 200 }
    const archive = new Archive(shared, 2)
    const algo = new GenerationalGa()
    algo.configure(
      shared,
      {
        ...DEFAULT_GENERATIONAL_GA,
        popSize: 8,
        eliteCount: 2,
        tournamentSize: 3,
        pCrossover: 1,
      },
      archive.shape,
      2,
    )
    seedArchive(algo, archive, algo.seedCount())
    const seedIds = new Set(archive.bots.map((b) => b.id))
    const children = algo.nextBatch(4, archive)
    expect(children.length).toBe(4)
    for (const child of children) {
      expect(seedIds.has(child.parentA!)).toBe(true)
      expect(seedIds.has(child.parentB!)).toBe(true)
      expect(child.meta?.origin).toBe('crossover')
      expect(child.meta?.generation).toBe(1)
    }
  })

  it('serialize/restore round-trips generation counter', () => {
    const shared = { ...DEFAULT_SHARED, maxBots: 200 }
    const archive = new Archive(shared, 3)
    const algo = new GenerationalGa()
    algo.configure(
      shared,
      { ...DEFAULT_GENERATIONAL_GA, popSize: 5, eliteCount: 1, pCrossover: 0 },
      archive.shape,
      3,
    )
    seedArchive(algo, archive, algo.seedCount())

    // Propose and evaluate a full generation of children (popSize - eliteCount = 4).
    const childTarget = 4
    let proposed = 0
    while (proposed < childTarget) {
      const batch = algo.nextBatch(2, archive)
      expect(batch.length).toBeGreaterThan(0)
      for (const c of batch) {
        const { bot, pruned } = archive.addEvaluated({
          genome: c.genome,
          fitness: 50 + proposed,
          gameScores: [50],
          gameSeeds: [100 + proposed],
          parentA: c.parentA,
          parentB: c.parentB,
          meta: c.meta,
        })
        algo.onEvaluated(bot, pruned)
        proposed++
      }
    }

    const state = algo.serialize() as { generation: number }
    expect(state.generation).toBe(1)

    const algo2 = new GenerationalGa()
    algo2.configure(
      shared,
      { ...DEFAULT_GENERATIONAL_GA, popSize: 5, eliteCount: 1 },
      archive.shape,
      99,
    )
    algo2.restore(state, archive)
    const restored = algo2.serialize() as { generation: number; poolIds: number[] }
    expect(restored.generation).toBe(1)
    expect(restored.poolIds.length).toBeGreaterThan(0)

    const next = algo2.nextBatch(1, archive)[0]!
    expect(next.meta?.generation).toBe(2)
  })
})
