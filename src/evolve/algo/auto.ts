import { DEFAULT_LEADERBOARD, DEFAULT_SHARED, type SharedParams } from '../params.ts'
import { DEFAULT_ALGORITHM_ID } from './registry.ts'
import type { RunConfig } from './types.ts'

export type MachineClass = 'phone' | 'laptop' | 'desktop'
export type MachineChoice = 'auto' | MachineClass
export type TargetBand = 'lt150' | '150_220' | '220_280' | '280plus'

export type HardwareHints = {
  hardwareConcurrency: number
  /** GiB; undefined when unavailable (Safari etc.). */
  deviceMemory?: number
}

export type AutoResult = RunConfig & {
  machine: MachineClass
  targetBand: TargetBand
  targetScore: number
}

type Preset = {
  algorithmId: string
  shared: Partial<SharedParams>
  algoParams: Record<string, number>
}

function targetBand(score: number): TargetBand {
  if (score < 150) return 'lt150'
  if (score < 220) return '150_220'
  if (score < 280) return '220_280'
  return '280plus'
}

/** Base presets: (machine × band) → knobs. All point at Leaderboard genetics for v1. */
const PRESETS: Record<MachineClass, Record<TargetBand, Preset>> = {
  phone: {
    lt150: {
      algorithmId: DEFAULT_ALGORITHM_ID,
      shared: { gamesPerFitness: 12, maxBots: 120, batchSize: 4, hidden1: 32, hidden2: 24, endStagnation: 800 },
      algoParams: { ...DEFAULT_LEADERBOARD, seedCount: 40, k: 1.5 },
    },
    '150_220': {
      algorithmId: DEFAULT_ALGORITHM_ID,
      shared: { gamesPerFitness: 20, maxBots: 160, batchSize: 4, hidden1: 40, hidden2: 32, endStagnation: 1200 },
      algoParams: { ...DEFAULT_LEADERBOARD, seedCount: 50, k: 1.6 },
    },
    '220_280': {
      algorithmId: DEFAULT_ALGORITHM_ID,
      shared: { gamesPerFitness: 28, maxBots: 200, batchSize: 6, hidden1: 48, hidden2: 36, endStagnation: 1600 },
      algoParams: { ...DEFAULT_LEADERBOARD, seedCount: 60, k: 1.7 },
    },
    '280plus': {
      algorithmId: DEFAULT_ALGORITHM_ID,
      shared: { gamesPerFitness: 36, maxBots: 240, batchSize: 6, hidden1: 48, hidden2: 40, endStagnation: 2000 },
      algoParams: { ...DEFAULT_LEADERBOARD, seedCount: 80, k: 1.8 },
    },
  },
  laptop: {
    lt150: {
      algorithmId: DEFAULT_ALGORITHM_ID,
      shared: { gamesPerFitness: 20, maxBots: 250, batchSize: 8, hidden1: 48, hidden2: 36, endStagnation: 1200 },
      algoParams: { ...DEFAULT_LEADERBOARD, seedCount: 60, k: 1.6 },
    },
    '150_220': {
      algorithmId: DEFAULT_ALGORITHM_ID,
      shared: { gamesPerFitness: 30, maxBots: 350, batchSize: 12, hidden1: 56, hidden2: 40, endStagnation: 1600 },
      algoParams: { ...DEFAULT_LEADERBOARD, seedCount: 80, k: 1.7 },
    },
    '220_280': {
      algorithmId: DEFAULT_ALGORITHM_ID,
      shared: { ...DEFAULT_SHARED, gamesPerFitness: 40, maxBots: 400, batchSize: 16, endStagnation: 2000 },
      algoParams: { ...DEFAULT_LEADERBOARD, seedCount: 100, k: 1.8 },
    },
    '280plus': {
      algorithmId: DEFAULT_ALGORITHM_ID,
      shared: { gamesPerFitness: 50, maxBots: 500, batchSize: 16, hidden1: 64, hidden2: 48, endStagnation: 2500 },
      algoParams: { ...DEFAULT_LEADERBOARD, seedCount: 120, k: 1.85, pMut: 0.0008 },
    },
  },
  desktop: {
    lt150: {
      algorithmId: DEFAULT_ALGORITHM_ID,
      shared: { gamesPerFitness: 24, maxBots: 400, batchSize: 16, hidden1: 56, hidden2: 40, endStagnation: 1500 },
      algoParams: { ...DEFAULT_LEADERBOARD, seedCount: 80, k: 1.6 },
    },
    '150_220': {
      algorithmId: DEFAULT_ALGORITHM_ID,
      shared: { gamesPerFitness: 36, maxBots: 600, batchSize: 24, hidden1: 64, hidden2: 48, endStagnation: 2000 },
      algoParams: { ...DEFAULT_LEADERBOARD, seedCount: 100, k: 1.75 },
    },
    '220_280': {
      algorithmId: DEFAULT_ALGORITHM_ID,
      shared: { gamesPerFitness: 48, maxBots: 800, batchSize: 32, hidden1: 72, hidden2: 56, endStagnation: 2500 },
      algoParams: { ...DEFAULT_LEADERBOARD, seedCount: 120, k: 1.8 },
    },
    '280plus': {
      algorithmId: DEFAULT_ALGORITHM_ID,
      shared: { gamesPerFitness: 64, maxBots: 1000, batchSize: 32, hidden1: 80, hidden2: 64, endStagnation: 3000 },
      algoParams: { ...DEFAULT_LEADERBOARD, seedCount: 150, k: 1.9, pMut: 0.0008, mutSigma: 0.015 },
    },
  },
}

export function detectMachine(hints: HardwareHints): MachineClass {
  const cores = hints.hardwareConcurrency || 4
  const mem = hints.deviceMemory
  if (mem !== undefined) {
    if (mem <= 4 || cores <= 4) return 'phone'
    if (mem >= 16 && cores >= 12) return 'desktop'
    return 'laptop'
  }
  if (cores <= 4) return 'phone'
  if (cores >= 12) return 'desktop'
  return 'laptop'
}

function clampInt(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, Math.round(n)))
}

/** Scale preset knobs from live hardware after the table lookup. */
export function applyHardwareHeuristic(
  preset: Preset,
  machine: MachineClass,
  targetScore: number,
  hints: HardwareHints,
): { shared: SharedParams; algoParams: Record<string, number> } {
  const cores = Math.max(1, hints.hardwareConcurrency || 4)
  const mem = hints.deviceMemory ?? (machine === 'desktop' ? 16 : machine === 'laptop' ? 8 : 4)

  const shared: SharedParams = {
    ...DEFAULT_SHARED,
    ...preset.shared,
    endTargetScore: Math.max(0, targetScore),
  }

  // batchSize ≈ workers; leave a couple cores for UI
  const batchHint = clampInt(cores - 1, 2, machine === 'phone' ? 8 : machine === 'laptop' ? 24 : 48)
  shared.batchSize = clampInt((shared.batchSize + batchHint) / 2, 2, batchHint)

  // Cap archive by RAM (~genome ~30KB at 64/48; be conservative)
  const maxByMem = clampInt(mem * 80, 80, machine === 'phone' ? 300 : machine === 'laptop' ? 800 : 2000)
  shared.maxBots = clampInt(Math.min(shared.maxBots, maxByMem), 40, maxByMem)

  // Harder targets → slightly more games / longer stagnation
  if (targetScore >= 280) {
    shared.gamesPerFitness = clampInt(shared.gamesPerFitness * 1.1, 8, 80)
    shared.endStagnation = clampInt(shared.endStagnation * 1.15, 400, 8000)
  } else if (targetScore < 150) {
    shared.gamesPerFitness = clampInt(shared.gamesPerFitness * 0.9, 8, 80)
  }

  // Shrink net on low memory
  if (mem <= 4) {
    shared.hidden1 = Math.min(shared.hidden1, 40)
    shared.hidden2 = Math.min(shared.hidden2, 32)
  }

  const algoParams = { ...preset.algoParams }
  if (typeof algoParams.seedCount === 'number') {
    algoParams.seedCount = clampInt(
      Math.min(algoParams.seedCount, Math.floor(shared.maxBots * 0.4)),
      10,
      shared.maxBots,
    )
  }

  return { shared, algoParams }
}

export function autoConfigure(
  targetScore: number,
  machineChoice: MachineChoice,
  hints: HardwareHints,
): AutoResult {
  const machine = machineChoice === 'auto' ? detectMachine(hints) : machineChoice
  const band = targetBand(targetScore)
  const preset = PRESETS[machine][band]
  const { shared, algoParams } = applyHardwareHeuristic(preset, machine, targetScore, hints)
  return {
    algorithmId: preset.algorithmId,
    shared,
    algoParams,
    machine,
    targetBand: band,
    targetScore,
  }
}
