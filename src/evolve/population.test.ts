import { describe, expect, it } from 'vitest'
import { Archive } from './archive.ts'
import { LeaderboardGenetics } from './algo/leaderboardGenetics.ts'
import { DEFAULT_LEADERBOARD, DEFAULT_SHARED } from './params.ts'

describe('LeaderboardGenetics children', () => {
  it('produces asexual children with parentB null when pCrossover is 0', () => {
    const shared = { ...DEFAULT_SHARED }
    const archive = new Archive(shared, 1)
    const algo = new LeaderboardGenetics()
    algo.configure(shared, { ...DEFAULT_LEADERBOARD, pCrossover: 0 }, archive.shape, 1)
    for (let i = 0; i < 3; i++) {
      const [seed] = algo.seedBatch(1)
      const { bot, pruned } = archive.addEvaluated({
        genome: seed!.genome,
        fitness: 100 + i,
        gameScores: [100],
        gameSeeds: [1],
        parentA: null,
        parentB: null,
      })
      algo.onEvaluated(bot, pruned)
    }
    const child = algo.nextBatch(1, archive)[0]!
    expect(child.parentA).toBeGreaterThan(0)
    expect(child.parentB).toBeNull()
    expect(child.genome.length).toBe(algo.seedBatch(1)[0]!.genome.length)
  })

  it('produces crossover children with both parents when pCrossover is 1', () => {
    const shared = { ...DEFAULT_SHARED }
    const archive = new Archive(shared, 2)
    const algo = new LeaderboardGenetics()
    algo.configure(shared, { ...DEFAULT_LEADERBOARD, pCrossover: 1 }, archive.shape, 2)
    for (let i = 0; i < 3; i++) {
      const [seed] = algo.seedBatch(1)
      const { bot, pruned } = archive.addEvaluated({
        genome: seed!.genome,
        fitness: 100 + i,
        gameScores: [100],
        gameSeeds: [1],
        parentA: null,
        parentB: null,
      })
      algo.onEvaluated(bot, pruned)
    }
    const child = algo.nextBatch(1, archive)[0]!
    expect(child.parentA).toBeGreaterThan(0)
    expect(child.parentB).toBeGreaterThan(0)
  })
})
