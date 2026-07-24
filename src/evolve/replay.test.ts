import { describe, expect, it } from 'vitest'
import { mulberry32 } from '../engine/index.ts'
import { defaultShape, randomGenome, INPUT_SIZE, OUTPUT_SIZE } from '../nn/index.ts'
import { buildGameSeeds, evaluateGenome } from './evaluate.ts'
import { evalBaseSeed, replayBotGames, resolveGameSeeds } from './replay.ts'
import type { BotRecord } from './population.ts'

describe('evalBaseSeed', () => {
  it('matches legacy orchestrator seed-bot formula', () => {
    expect(evalBaseSeed({ id: 1, parentA: null })).toBe(1)
    expect(evalBaseSeed({ id: 2, parentA: null })).toBe((1 * 7919 + 1) >>> 0)
  })

  it('matches legacy orchestrator child formula', () => {
    expect(evalBaseSeed({ id: 101, parentA: 3 })).toBe((101 * 104729) >>> 0)
  })
})

describe('resolveGameSeeds', () => {
  it('prefers stored gameSeeds', () => {
    const stored = [9, 8, 7, 6]
    expect(
      resolveGameSeeds(
        { id: 1, parentA: null, gameScores: [1, 2, 3, 4], gameSeeds: stored },
        3,
      ),
    ).toEqual([9, 8, 7])
  })

  it('falls back to legacy baseSeed formula', () => {
    const seeds = resolveGameSeeds(
      { id: 1, parentA: null, gameScores: [1, 2] },
      2,
    )
    const base = evalBaseSeed({ id: 1, parentA: null })
    expect(seeds).toEqual([(base + 0 * 10007) >>> 0, (base + 1 * 10007) >>> 0])
  })
})

describe('replayBotGames', () => {
  it('replays stored gameSeeds with matching totals', () => {
    const shape = defaultShape(INPUT_SIZE, OUTPUT_SIZE, 8, 6)
    const genome = randomGenome(shape, mulberry32(7))
    const gameSeeds = buildGameSeeds(4, 0.5, 99, mulberry32(11))
    const evalResult = evaluateGenome(genome, shape, gameSeeds, 0)
    const bot: BotRecord = {
      id: 50,
      fitness: evalResult.fitness,
      gameScores: evalResult.gameScores,
      gameSeeds: evalResult.gameSeeds,
      parentA: 1,
      parentB: null,
      genome,
      tickets: 1,
    }
    const replay = replayBotGames(bot, shape)
    expect(replay.matched).toBe(true)
    expect(replay.games.map((g) => g.total)).toEqual(bot.gameScores)
  })

  it('replays legacy bots without gameSeeds', () => {
    const shape = defaultShape(INPUT_SIZE, OUTPUT_SIZE, 8, 6)
    const genome = randomGenome(shape, mulberry32(7))
    const botMeta = { id: 1, parentA: null as number | null, parentB: null as number | null }
    const legacySeeds = resolveGameSeeds(
      { ...botMeta, gameScores: [0, 0, 0, 0] },
      4,
    )
    const evalResult = evaluateGenome(genome, shape, legacySeeds, 0)
    const bot: BotRecord = {
      id: botMeta.id,
      fitness: evalResult.fitness,
      gameScores: evalResult.gameScores,
      parentA: botMeta.parentA,
      parentB: botMeta.parentB,
      genome,
      tickets: 1,
    }
    const replay = replayBotGames(bot, shape)
    expect(replay.matched).toBe(true)
  })
})
