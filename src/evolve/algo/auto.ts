import { DEFAULT_LEADERBOARD, DEFAULT_SHARED, type SharedParams } from '../params.ts'
import { DEFAULT_CMA_ES } from './cmaEs.ts'
import { DEFAULT_GENERATIONAL_GA } from './generationalGa.ts'
import { DEFAULT_ONE_PLUS_LAMBDA } from './onePlusLambda.ts'
import { DEFAULT_OPENAI_ES } from './openAiEs.ts'
import { DEFAULT_ALGORITHM_ID } from './registry.ts'
import { DEFAULT_GAME_IDS } from '../../games/types.ts'
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

/**
 * Base presets: (machine x band) -> algo + knobs.
 * Easy/low-power -> (1+λ); mid -> generational / leaderboard; hard/desktop -> ES / CMA-ES.
 */
const PRESETS: Record<MachineClass, Record<TargetBand, Preset>> = {
  phone: {
    lt150: {
      algorithmId: 'onePlusLambda',
      shared: { gamesPerFitness: 12, maxBots: 80, batchSize: 4, hidden1: 32, hidden2: 24, endStagnation: 600 },
      algoParams: { ...DEFAULT_ONE_PLUS_LAMBDA, lambda: 8, seedCount: 6 },
    },
    '150_220': {
      algorithmId: 'onePlusLambda',
      shared: { gamesPerFitness: 18, maxBots: 120, batchSize: 4, hidden1: 40, hidden2: 32, endStagnation: 900 },
      algoParams: { ...DEFAULT_ONE_PLUS_LAMBDA, lambda: 12, seedCount: 8 },
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
      algorithmId: 'onePlusLambda',
      shared: { gamesPerFitness: 20, maxBots: 200, batchSize: 8, hidden1: 48, hidden2: 36, endStagnation: 1000 },
      algoParams: { ...DEFAULT_ONE_PLUS_LAMBDA, lambda: 16, seedCount: 8 },
    },
    '150_220': {
      algorithmId: 'generationalGa',
      shared: { gamesPerFitness: 30, maxBots: 350, batchSize: 12, hidden1: 56, hidden2: 40, endStagnation: 1600 },
      algoParams: { ...DEFAULT_GENERATIONAL_GA, popSize: 60, eliteCount: 4 },
    },
    '220_280': {
      algorithmId: DEFAULT_ALGORITHM_ID,
      shared: { ...DEFAULT_SHARED, gamesPerFitness: 40, maxBots: 400, batchSize: 16, endStagnation: 2000 },
      algoParams: { ...DEFAULT_LEADERBOARD, seedCount: 100, k: 1.8 },
    },
    '280plus': {
      algorithmId: 'openAiEs',
      shared: { gamesPerFitness: 48, maxBots: 500, batchSize: 16, hidden1: 64, hidden2: 48, endStagnation: 2500 },
      algoParams: { ...DEFAULT_OPENAI_ES, population: 32, sigma: 0.02, learningRate: 0.01 },
    },
  },
  desktop: {
    lt150: {
      algorithmId: 'onePlusLambda',
      shared: { gamesPerFitness: 24, maxBots: 300, batchSize: 16, hidden1: 56, hidden2: 40, endStagnation: 1200 },
      algoParams: { ...DEFAULT_ONE_PLUS_LAMBDA, lambda: 24, seedCount: 12 },
    },
    '150_220': {
      algorithmId: 'generationalGa',
      shared: { gamesPerFitness: 36, maxBots: 500, batchSize: 24, hidden1: 64, hidden2: 48, endStagnation: 2000 },
      algoParams: { ...DEFAULT_GENERATIONAL_GA, popSize: 100, eliteCount: 6, tournamentSize: 4 },
    },
    '220_280': {
      algorithmId: 'openAiEs',
      shared: { gamesPerFitness: 48, maxBots: 700, batchSize: 32, hidden1: 64, hidden2: 48, endStagnation: 2500 },
      algoParams: { ...DEFAULT_OPENAI_ES, population: 48, sigma: 0.02, learningRate: 0.012 },
    },
    '280plus': {
      algorithmId: 'cmaEs',
      shared: { gamesPerFitness: 56, maxBots: 800, batchSize: 32, hidden1: 48, hidden2: 36, endStagnation: 3000 },
      algoParams: { ...DEFAULT_CMA_ES, lambda: 24, mu: 12, sigma: 0.15 },
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

  const batchHint = clampInt(cores - 1, 2, machine === 'phone' ? 8 : machine === 'laptop' ? 24 : 48)
  shared.batchSize = clampInt((shared.batchSize + batchHint) / 2, 2, batchHint)

  const maxByMem = clampInt(mem * 80, 80, machine === 'phone' ? 300 : machine === 'laptop' ? 800 : 2000)
  shared.maxBots = clampInt(Math.min(shared.maxBots, maxByMem), 40, maxByMem)

  if (targetScore >= 280) {
    shared.gamesPerFitness = clampInt(shared.gamesPerFitness * 1.1, 8, 80)
    shared.endStagnation = clampInt(shared.endStagnation * 1.15, 400, 8000)
  } else if (targetScore < 150) {
    shared.gamesPerFitness = clampInt(shared.gamesPerFitness * 0.9, 8, 80)
  }

  if (mem <= 4) {
    shared.hidden1 = Math.min(shared.hidden1, 40)
    shared.hidden2 = Math.min(shared.hidden2, 32)
  }

  // CMA-ES prefers smaller nets on all machines
  if (preset.algorithmId === 'cmaEs') {
    shared.hidden1 = Math.min(shared.hidden1, 48)
    shared.hidden2 = Math.min(shared.hidden2, 36)
  }

  const algoParams = { ...preset.algoParams }
  if (typeof algoParams.seedCount === 'number') {
    const cap = Math.max(1, Math.floor(shared.maxBots * 0.4))
    algoParams.seedCount = clampInt(Math.min(algoParams.seedCount, cap), 1, shared.maxBots)
  }
  if (typeof algoParams.popSize === 'number') {
    algoParams.popSize = clampInt(Math.min(algoParams.popSize, shared.maxBots), 2, shared.maxBots)
  }
  if (typeof algoParams.population === 'number') {
    let pop = clampInt(algoParams.population, 2, Math.max(2, shared.batchSize * 4))
    if (pop % 2 !== 0) pop -= 1
    if (pop < 2) pop = 2
    algoParams.population = pop
  }
  if (typeof algoParams.lambda === 'number') {
    algoParams.lambda = clampInt(algoParams.lambda, 1, Math.max(2, shared.batchSize * 4))
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
    gameIds: [...DEFAULT_GAME_IDS],
    shared,
    algoParams,
    machine,
    targetBand: band,
    targetScore,
  }
}
