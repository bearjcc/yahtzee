import { describe, expect, it } from 'vitest'
import { mulberry32 } from '../engine/index.ts'
import { defaultShape, randomGenome, INPUT_SIZE, OUTPUT_SIZE } from '../nn/index.ts'
import {
  buildGameSeeds,
  evaluateGenome,
  fitnessFromScores,
  sampleStdev,
  sharedGameCount,
} from './evaluate.ts'

describe('sharedGameCount', () => {
  it('floors fraction of games', () => {
    expect(sharedGameCount(40, 0.5)).toBe(20)
    expect(sharedGameCount(15, 0.5)).toBe(7)
    expect(sharedGameCount(10, 0)).toBe(0)
    expect(sharedGameCount(10, 1)).toBe(10)
  })
})

describe('buildGameSeeds', () => {
  it('shares leading seeds and randomises the rest', () => {
    const rngA = mulberry32(1)
    const rngB = mulberry32(2)
    const a = buildGameSeeds(6, 0.5, 1000, rngA)
    const b = buildGameSeeds(6, 0.5, 1000, rngB)
    expect(a.slice(0, 3)).toEqual([
      (1000 + 0 * 10007) >>> 0,
      (1000 + 1 * 10007) >>> 0,
      (1000 + 2 * 10007) >>> 0,
    ])
    expect(b.slice(0, 3)).toEqual(a.slice(0, 3))
    expect(a.slice(3)).not.toEqual(b.slice(3))
  })
})

describe('fitnessFromScores', () => {
  it('equals mean when penalty is 0', () => {
    expect(fitnessFromScores([100, 200, 300], 0)).toBe(200)
  })

  it('penalises high variance', () => {
    const flat = fitnessFromScores([200, 200, 200], 0.25)
    const spiky = fitnessFromScores([50, 200, 350], 0.25)
    expect(flat).toBe(200)
    expect(spiky).toBeLessThan(200)
    expect(sampleStdev([50, 200, 350])).toBeGreaterThan(0)
  })
})

describe('evaluateGenome', () => {
  it('returns scores for each seed and applies stdev penalty', () => {
    const shape = defaultShape(INPUT_SIZE, OUTPUT_SIZE, 8, 6)
    const genome = randomGenome(shape, mulberry32(9))
    const seeds = buildGameSeeds(4, 0.5, 42, mulberry32(3))
    const result = evaluateGenome(genome, shape, seeds, 0.25, ['yahtzee'])
    expect(result.gameScores).toHaveLength(4)
    expect(result.gameSeeds).toEqual(seeds)
    expect(result.fitness).toBeCloseTo(fitnessFromScores(result.gameScores, 0.25))
  })

  it('plays gamesPerFitness episodes per selected game', () => {
    const shape = defaultShape(INPUT_SIZE, OUTPUT_SIZE, 8, 6)
    const genome = randomGenome(shape, mulberry32(9))
    const seeds = [
      ...buildGameSeeds(2, 0.5, 42, mulberry32(3)),
      ...buildGameSeeds(2, 0.5, 99, mulberry32(4)),
    ]
    const result = evaluateGenome(genome, shape, seeds, 0, ['yahtzee', 'farkle'])
    expect(result.gameScores).toHaveLength(4)
  })
})
