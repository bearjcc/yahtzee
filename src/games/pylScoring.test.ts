import { describe, expect, it } from 'vitest'
import {
  bestScoringSubset,
  canScore,
  resolveSetAside,
  scoreAllUsed,
} from './pylScoring.ts'

describe('scoreAllUsed farkle', () => {
  it('scores singles and three of a kind', () => {
    expect(scoreAllUsed([1], 'farkle')).toBe(100)
    expect(scoreAllUsed([5], 'farkle')).toBe(50)
    expect(scoreAllUsed([2, 2, 2], 'farkle')).toBe(200)
    expect(scoreAllUsed([1, 1, 1], 'farkle')).toBe(1000)
    expect(scoreAllUsed([4, 4, 4, 4], 'farkle')).toBe(800)
  })

  it('scores straight and three pairs', () => {
    expect(scoreAllUsed([1, 2, 3, 4, 5, 6], 'farkle')).toBe(1500)
    expect(scoreAllUsed([2, 2, 3, 3, 5, 5], 'farkle')).toBe(1500)
  })

  it('rejects leftover non-scoring dice', () => {
    expect(scoreAllUsed([1, 2], 'farkle')).toBe(0)
    expect(scoreAllUsed([2, 3, 4], 'farkle')).toBe(0)
  })
})

describe('scoreAllUsed sixCubes', () => {
  it('scores straight but not three pairs', () => {
    expect(scoreAllUsed([1, 2, 3, 4, 5, 6], 'sixCubes')).toBe(1500)
    expect(scoreAllUsed([2, 2, 3, 3, 5, 5], 'sixCubes')).toBe(0)
  })
})

describe('bestScoringSubset / resolveSetAside', () => {
  it('finds scoring dice in a mixed roll', () => {
    const best = bestScoringSubset([1, 2, 3, 5, 6, 6], 'farkle')
    expect(best).not.toBeNull()
    expect(best!.points).toBe(150) // 1 + 5
    expect(canScore([2, 3, 4, 6, 6, 6], 'farkle')).toBe(true)
    expect(canScore([2, 3, 4, 6, 6, 2], 'farkle')).toBe(false)
  })

  it('repairs illegal hold masks', () => {
    const dice = [1, 2, 3, 5, 6, 6]
    const held = [true, true, false, false, false, false] // 1+2 illegal
    const resolved = resolveSetAside(dice, held, 'farkle')
    expect(resolved.points).toBeGreaterThan(0)
    expect(scoreAllUsed(dice.filter((_, i) => resolved.mask[i]), 'farkle')).toBe(resolved.points)
  })
})
