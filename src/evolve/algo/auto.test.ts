import { describe, expect, it } from 'vitest'
import { applyHardwareHeuristic, autoConfigure, detectMachine } from './auto.ts'
import { DEFAULT_ALGORITHM_ID } from './registry.ts'

describe('auto configure', () => {
  it('detects machine class from cores and memory', () => {
    expect(detectMachine({ hardwareConcurrency: 2, deviceMemory: 2 })).toBe('phone')
    expect(detectMachine({ hardwareConcurrency: 8, deviceMemory: 8 })).toBe('laptop')
    expect(detectMachine({ hardwareConcurrency: 16, deviceMemory: 32 })).toBe('desktop')
  })

  it('returns clamped knobs for desktop high target', () => {
    const result = autoConfigure(300, 'desktop', {
      hardwareConcurrency: 16,
      deviceMemory: 32,
    })
    expect(result.algorithmId).toBe(DEFAULT_ALGORITHM_ID)
    expect(result.machine).toBe('desktop')
    expect(result.targetBand).toBe('280plus')
    expect(result.shared.endTargetScore).toBe(300)
    expect(result.shared.maxBots).toBeGreaterThanOrEqual(40)
    expect(result.shared.maxBots).toBeLessThanOrEqual(2000)
    expect(result.shared.batchSize).toBeGreaterThanOrEqual(2)
    expect(result.shared.batchSize).toBeLessThanOrEqual(48)
    expect(result.shared.gamesPerFitness).toBeGreaterThanOrEqual(8)
    expect(result.algoParams.seedCount).toBeLessThanOrEqual(result.shared.maxBots)
  })

  it('keeps phone archives small', () => {
    const result = autoConfigure(200, 'phone', {
      hardwareConcurrency: 4,
      deviceMemory: 4,
    })
    expect(result.shared.maxBots).toBeLessThanOrEqual(300)
    expect(result.shared.batchSize).toBeLessThanOrEqual(8)
  })

  it('heuristic never exceeds memory-based maxBots', () => {
    const { shared } = applyHardwareHeuristic(
      {
        algorithmId: DEFAULT_ALGORITHM_ID,
        shared: { maxBots: 50000, batchSize: 128, gamesPerFitness: 10 },
        algoParams: { seedCount: 20000 },
      },
      'laptop',
      180,
      { hardwareConcurrency: 8, deviceMemory: 8 },
    )
    expect(shared.maxBots).toBeLessThanOrEqual(800)
  })
})
