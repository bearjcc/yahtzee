import { describe, expect, it } from 'vitest'
import { mulberry32 } from '../engine/index.ts'
import { defaultShape, randomGenome, INPUT_SIZE, OUTPUT_SIZE } from '../nn/index.ts'
import { evaluateGenome } from './evaluate.ts'
import { evalBaseSeed, replayBotGames } from './replay.ts'
import type { BotRecord } from './population.ts'

describe('evalBaseSeed', () => {
  it('matches orchestrator seed-bot formula', () => {
    expect(evalBaseSeed({ id: 1, parentA: null })).toBe(1)
    expect(evalBaseSeed({ id: 2, parentA: null })).toBe((1 * 7919 + 1) >>> 0)
  })

  it('matches orchestrator child formula', () => {
    expect(evalBaseSeed({ id: 101, parentA: 3 })).toBe((101 * 104729) >>> 0)
  })
})

describe('replayBotGames', () => {
  it('replays seed and child fitness games with matching totals', () => {
    const shape = defaultShape(INPUT_SIZE, OUTPUT_SIZE, 8, 6)
    const genome = randomGenome(shape, mulberry32(7))
    const gamesPerFitness = 4

    for (const botMeta of [
      { id: 1, parentA: null as number | null, parentB: null as number | null },
      { id: 50, parentA: 1, parentB: 2 },
    ]) {
      const baseSeed = evalBaseSeed(botMeta)
      const evalResult = evaluateGenome(genome, shape, gamesPerFitness, baseSeed)
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
      expect(replay.games.map((g) => g.total)).toEqual(bot.gameScores)
    }
  })
})
