import { describe, expect, it } from 'vitest'
import { mulberry32 } from '../engine/rng.ts'
import { Lottery, ticketsForScore } from './lottery.ts'

describe('lottery', () => {
  it('tickets scale with score^k', () => {
    expect(ticketsForScore(100, 1)).toBeCloseTo(100)
    expect(ticketsForScore(100, 2)).toBeCloseTo(10000)
  })

  it('draw is biased toward higher scores', () => {
    const lot = new Lottery(2)
    lot.add(1, 10)
    lot.add(2, 200)
    const rng = mulberry32(1)
    const counts = new Map<number, number>()
    for (let i = 0; i < 5000; i++) {
      const id = lot.draw(rng)
      counts.set(id, (counts.get(id) ?? 0) + 1)
    }
    expect(counts.get(2)!).toBeGreaterThan(counts.get(1)! * 10)
  })

  it('removeId drops tickets and keeps draw working', () => {
    const lot = new Lottery(1)
    lot.add(1, 10)
    lot.add(2, 20)
    lot.add(3, 30)
    expect(lot.removeId(2)).toBe(true)
    expect(lot.size).toBe(2)
    expect(lot.totalTickets).toBeCloseTo(40)
    const rng = mulberry32(3)
    for (let i = 0; i < 100; i++) {
      const id = lot.draw(rng)
      expect(id === 1 || id === 3).toBe(true)
    }
  })
})
