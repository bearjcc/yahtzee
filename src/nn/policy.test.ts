import { describe, expect, it } from 'vitest'
import { mulberry32, newGame, playGame, rollDice } from '../engine/index.ts'
import { defaultShape, randomGenome } from './network.ts'
import { INPUT_SIZE, OUTPUT_SIZE, encodeState } from './encode.ts'
import { decide } from './policy.ts'

describe('policy + encode', () => {
  it('encodes fixed-length vector', () => {
    const s = newGame()
    const rng = mulberry32(7)
    const rolled = rollDice(s, rng)
    expect(encodeState(rolled).length).toBe(INPUT_SIZE)
  })

  it('plays a full game without throwing', () => {
    const shape = defaultShape(INPUT_SIZE, OUTPUT_SIZE, 16, 12)
    const genome = randomGenome(shape, mulberry32(99))
    const score = playGame(mulberry32(12345), (st) => decide(st, genome, shape))
    expect(score).toBeGreaterThanOrEqual(0)
    expect(score).toBeLessThan(2000)
  })
})
