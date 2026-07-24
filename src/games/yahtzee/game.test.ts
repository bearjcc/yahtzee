import { describe, expect, it } from 'vitest'
import { mulberry32 } from '../../engine/rng.ts'
import { playGame, playGameResult, type Decision } from './game.ts'
import { CATEGORIES, type Category } from './types.ts'

function sequentialDecide(): (state: import('./types.ts').GameState) => Decision {
  return (state) => {
    const open = CATEGORIES.filter((c) => state.scorecard[c] === null) as Category[]
    return {
      scoreNow: true,
      held: [false, false, false, false, false],
      category: open[0]!,
    }
  }
}

describe('playGameResult', () => {
  it('matches playGame total and fills all categories', () => {
    const decide = sequentialDecide()
    const seed = 424242
    const total = playGame(mulberry32(seed), decide)
    const result = playGameResult(mulberry32(seed), sequentialDecide())
    expect(result.total).toBe(total)
    for (const c of CATEGORIES) {
      expect(result.scorecard[c]).not.toBeNull()
    }
    expect(result.yahtzeeBonuses).toBeGreaterThanOrEqual(0)
  })
})
