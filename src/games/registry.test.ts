import { describe, expect, it } from 'vitest'
import { getGame, getGames, listGames } from './registry.ts'
import { normalizeGameIds } from './types.ts'

describe('game registry', () => {
  it('lists three games', () => {
    const ids = listGames().map((g) => g.id)
    expect(ids).toEqual(['yahtzee', 'farkle', 'sixCubes'])
  })

  it('normalises empty selection to yahtzee', () => {
    expect(normalizeGameIds([])).toEqual(['yahtzee'])
    expect(getGames([]).map((g) => g.id)).toEqual(['yahtzee'])
  })

  it('dedupes and preserves order', () => {
    expect(normalizeGameIds(['farkle', 'yahtzee', 'farkle', 'sixCubes'])).toEqual([
      'farkle',
      'yahtzee',
      'sixCubes',
    ])
    expect(getGame('sixCubes').goalScore).toBe(5_000)
    expect(getGame('farkle').goalScore).toBe(10_000)
  })
})
