import { describe, expect, it } from 'vitest'
import { getGame, getGames, listGames } from './registry.ts'
import { normalizeGameIds } from './types.ts'

describe('game registry', () => {
  it('lists four games', () => {
    const ids = listGames().map((g) => g.id)
    expect(ids).toEqual(['yahtzee', 'farkle', 'sixCubes', 'goblinGamble'])
  })

  it('normalises empty selection to yahtzee', () => {
    expect(normalizeGameIds([])).toEqual(['yahtzee'])
    expect(getGames([]).map((g) => g.id)).toEqual(['yahtzee'])
  })

  it('dedupes and preserves order', () => {
    expect(
      normalizeGameIds(['farkle', 'yahtzee', 'farkle', 'sixCubes', 'goblinGamble']),
    ).toEqual(['farkle', 'yahtzee', 'sixCubes', 'goblinGamble'])
    expect(getGame('sixCubes').goalScore).toBe(5_000)
    expect(getGame('farkle').goalScore).toBe(10_000)
    expect(getGame('goblinGamble').diceCount).toBe(12)
    expect(getGame('goblinGamble').oneHotIndex).toBe(3)
  })
})
