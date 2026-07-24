import { describe, expect, it } from 'vitest'
import { mulberry32 } from '../engine/rng.ts'
import { crossoverAndMutate, mutateCopy } from './crossover.ts'

describe('mutateCopy', () => {
  it('returns a new array and can change weights', () => {
    const parent = new Float32Array([0, 0, 0, 0, 0, 0, 0, 0])
    const child = mutateCopy(parent, mulberry32(1), 1, 0.5)
    expect(child).not.toBe(parent)
    expect(parent.every((x) => x === 0)).toBe(true)
    expect(child.some((x) => x !== 0)).toBe(true)
  })
})

describe('crossoverAndMutate', () => {
  it('mixes parents then mutates', () => {
    const a = new Float32Array([1, 1, 1, 1])
    const b = new Float32Array([2, 2, 2, 2])
    const child = crossoverAndMutate(a, b, mulberry32(5), 0, 0)
    for (let i = 0; i < child.length; i++) {
      expect(child[i] === 1 || child[i] === 2).toBe(true)
    }
  })
})
