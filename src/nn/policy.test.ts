import { describe, expect, it } from 'vitest'
import { mulberry32, newGame, rollDice } from '../engine/index.ts'
import { yahtzeeGame } from '../games/yahtzee/index.ts'
import { encodeYahtzeeInto } from '../games/yahtzee/encode.ts'
import { defaultShape, randomGenome } from './network.ts'
import { INPUT_SIZE, OUTPUT_SIZE } from './encode.ts'
import { actFromEncode } from './policy.ts'

describe('policy + encode', () => {
  it('encodes fixed-length shared vector', () => {
    const s = newGame()
    const rng = mulberry32(7)
    const rolled = rollDice(s, rng)
    const v = new Float32Array(INPUT_SIZE)
    encodeYahtzeeInto(rolled, v)
    expect(v.length).toBe(INPUT_SIZE)
    expect(v[0]).toBeGreaterThan(0)
  })

  it('plays a full Yahtzee game without throwing', () => {
    const shape = defaultShape(INPUT_SIZE, OUTPUT_SIZE, 16, 12)
    const genome = randomGenome(shape, mulberry32(99))
    const scratch = { input: new Float32Array(shape.inputSize), a1: new Float32Array(shape.hidden1), a2: new Float32Array(shape.hidden2), out: new Float32Array(shape.outputSize) }
    const score = yahtzeeGame.play(mulberry32(12345), (encodeInto) =>
      actFromEncode(encodeInto, genome, shape, scratch),
    )
    expect(score).toBeGreaterThanOrEqual(0)
    expect(score).toBeLessThan(2000)
  })
})
