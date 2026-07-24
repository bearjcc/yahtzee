import { describe, expect, it } from 'vitest'
import { DEFAULT_PARAMS } from './params.ts'
import { Orchestrator } from './orchestrator.ts'

describe('Orchestrator checkpoints', () => {
  it('round-trips algorithmId in v2 serialize/load', () => {
    const orch = new Orchestrator({
      algorithmId: 'leaderboardGenetics',
      shared: {
        gamesPerFitness: 4,
        sharedGameFraction: 0.5,
        fitnessStdPenalty: 0.25,
        maxBots: 50,
        hidden1: 8,
        hidden2: 8,
        endMaxBots: 0,
        endTargetScore: 0,
        endStagnation: 0,
        batchSize: 2,
      },
      algoParams: {
        k: 1.5,
        seedCount: 3,
        pMut: 0.01,
        mutSigma: 0.05,
        pCrossover: 0,
      },
    })
    const seeds = orch.algorithm.seedBatch(2)
    for (const s of seeds) {
      const { bot, pruned } = orch.archive.addEvaluated({
        genome: s.genome,
        fitness: 50 + (s.parentA ?? 0),
        gameScores: [50],
        gameSeeds: [1],
        parentA: s.parentA,
        parentB: s.parentB,
        meta: s.meta,
      })
      orch.algorithm.onEvaluated(bot, pruned)
    }

    const dump = orch.serialize()
    expect(dump.version).toBe(2)
    expect(dump.algorithmId).toBe('leaderboardGenetics')
    expect(dump.bots.length).toBe(2)

    const orch2 = new Orchestrator()
    orch2.loadSerialized(dump)
    expect(orch2.algorithm.id).toBe('leaderboardGenetics')
    expect(orch2.archive.bots.length).toBe(2)
    expect(orch2.algoParams.k).toBe(1.5)
    expect(orch2.shared.maxBots).toBe(50)
  })

  it('migrates legacy flat checkpoints to Leaderboard genetics', () => {
    const legacy = {
      params: { ...DEFAULT_PARAMS, k: 1.2, maxBots: 40 },
      nextId: 2,
      bestFitness: 10,
      bestId: 1,
      botsSinceBestImprove: 0,
      bots: [
        {
          id: 1,
          fitness: 10,
          gameScores: [10],
          gameSeeds: [1],
          parentA: null,
          parentB: null,
          tickets: 1,
          genome: Array.from({ length: 100 }, () => 0.1),
        },
      ],
    }
    const orch = new Orchestrator()
    orch.loadSerialized(legacy)
    expect(orch.algorithm.id).toBe('leaderboardGenetics')
    expect(orch.shared.maxBots).toBe(40)
    expect(orch.algoParams.k).toBe(1.2)
    expect(orch.archive.bots.length).toBe(1)
  })
})
