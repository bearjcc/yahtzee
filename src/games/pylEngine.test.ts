import { describe, expect, it } from 'vitest'
import { mulberry32 } from '../engine/rng.ts'
import { INPUT_SIZE, OUT, OUTPUT_SIZE } from '../nn/layout.ts'
import { actFromEncode, createScratch, defaultShape, randomGenome } from '../nn/index.ts'
import { farkleGame } from './farkle.ts'
import { sixCubesGame } from './sixCubes.ts'
import { playPyl } from './pylEngine.ts'

/** Always set aside first six hold slots and bank when possible. */
function bankAlwaysAct(): Float32Array {
  const out = new Float32Array(OUTPUT_SIZE)
  for (let i = 0; i < 6; i++) out[OUT.hold + i] = 1
  out[OUT.bankOrScore] = 1
  return out
}

describe('push-your-luck engines', () => {
  it('farkle reaches goal and returns goal/turns fitness', () => {
    const result = farkleGame.playResult(mulberry32(11), () => bankAlwaysAct())
    expect(result.kind).toBe('pyl')
    if (result.kind !== 'pyl') return
    expect(result.goal).toBe(10_000)
    expect(result.turns).toBeGreaterThan(0)
    expect(result.total).toBeCloseTo(result.goal / result.turns)
    expect(result.banked).toBeGreaterThan(0)
    expect(result.turns).toBeLessThanOrEqual(500)
  })

  it('six cubes uses 5000 goal', () => {
    const result = sixCubesGame.playResult(mulberry32(22), () => bankAlwaysAct())
    expect(result.kind).toBe('pyl')
    if (result.kind !== 'pyl') return
    expect(result.goal).toBe(5_000)
    expect(result.banked).toBeGreaterThan(0)
    expect(result.total).toBeCloseTo(result.goal / result.turns)
    expect(result.turns).toBeLessThanOrEqual(500)
  })

  it('hot-dice path can continue after scoring all six', () => {
    const result = playPyl(mulberry32(99), () => bankAlwaysAct(), {
      mode: 'farkle',
      goal: 500,
      oneHotIndex: 1,
      maxTurns: 80,
    })
    expect(result.banked).toBeGreaterThanOrEqual(500)
    expect(result.turns).toBeLessThanOrEqual(80)
  })

  it('random net can play farkle without throwing', () => {
    const shape = defaultShape(INPUT_SIZE, OUTPUT_SIZE, 8, 6)
    const genome = randomGenome(shape, mulberry32(3))
    const scratch = createScratch(shape)
    const result = farkleGame.playResult(mulberry32(11), (encodeInto) =>
      actFromEncode(encodeInto, genome, shape, scratch),
    )
    expect(result.kind).toBe('pyl')
    if (result.kind !== 'pyl') return
    expect(result.turns).toBeGreaterThan(0)
    expect(result.turns).toBeLessThanOrEqual(500)
  })
})
