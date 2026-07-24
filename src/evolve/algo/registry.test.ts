import { describe, expect, it } from 'vitest'
import { DEFAULT_ALGORITHM_ID, getAlgorithm, isRegisteredAlgorithm, listAlgorithms } from './registry.ts'

describe('algorithm registry', () => {
  it('lists all five trainers including Leaderboard genetics', () => {
    const ids = listAlgorithms().map((a) => a.id).sort()
    expect(ids).toEqual([
      'cmaEs',
      'generationalGa',
      'leaderboardGenetics',
      'onePlusLambda',
      'openAiEs',
    ].sort())
    expect(getAlgorithm(DEFAULT_ALGORITHM_ID).label).toBe('Leaderboard genetics')
  })

  it('falls back to default for unknown ids', () => {
    expect(isRegisteredAlgorithm('nope')).toBe(false)
    expect(getAlgorithm('nope').id).toBe(DEFAULT_ALGORITHM_ID)
  })

  it('resolves each registered id', () => {
    for (const id of ['leaderboardGenetics', 'generationalGa', 'onePlusLambda', 'openAiEs', 'cmaEs']) {
      expect(isRegisteredAlgorithm(id)).toBe(true)
      expect(getAlgorithm(id).id).toBe(id)
    }
  })
})
