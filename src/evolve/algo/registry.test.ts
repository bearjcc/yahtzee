import { describe, expect, it } from 'vitest'
import { DEFAULT_ALGORITHM_ID, getAlgorithm, isRegisteredAlgorithm, listAlgorithms } from './registry.ts'

describe('algorithm registry', () => {
  it('lists Leaderboard genetics by default', () => {
    const list = listAlgorithms()
    expect(list.some((a) => a.id === DEFAULT_ALGORITHM_ID)).toBe(true)
    expect(getAlgorithm(DEFAULT_ALGORITHM_ID).label).toBe('Leaderboard genetics')
  })

  it('falls back to default for unknown ids', () => {
    expect(isRegisteredAlgorithm('nope')).toBe(false)
    expect(getAlgorithm('nope').id).toBe(DEFAULT_ALGORITHM_ID)
  })
})
