export interface SharedParams {
  gamesPerFitness: number
  sharedGameFraction: number
  fitnessStdPenalty: number
  maxBots: number
  hidden1: number
  hidden2: number
  /** Stop after this many bots created (0 = off). */
  endMaxBots: number
  /** Stop when best fitness >= this (0 = off). */
  endTargetScore: number
  /** Stop when best unchanged for this many new bots (0 = off). */
  endStagnation: number
  batchSize: number
}

/** Leaderboard-genetics-specific knobs (also used in legacy flat checkpoints). */
export interface LeaderboardParams {
  k: number
  seedCount: number
  pMut: number
  mutSigma: number
  pCrossover: number
}

/** Flat params used by legacy checkpoints and Leaderboard genetics defaults. */
export interface EvolveParams extends SharedParams, LeaderboardParams {}

export const DEFAULT_SHARED: SharedParams = {
  gamesPerFitness: 40,
  sharedGameFraction: 0.5,
  fitnessStdPenalty: 0.25,
  maxBots: 400,
  hidden1: 64,
  hidden2: 48,
  endMaxBots: 0,
  endTargetScore: 280,
  endStagnation: 2000,
  batchSize: 16,
}

export const DEFAULT_LEADERBOARD: LeaderboardParams = {
  k: 1.8,
  seedCount: 100,
  pMut: 0.001,
  mutSigma: 0.02,
  pCrossover: 0.25,
}

export const DEFAULT_PARAMS: EvolveParams = {
  ...DEFAULT_SHARED,
  ...DEFAULT_LEADERBOARD,
}

export const SHARED_PARAM_KEYS: (keyof SharedParams)[] = [
  'gamesPerFitness',
  'sharedGameFraction',
  'fitnessStdPenalty',
  'maxBots',
  'hidden1',
  'hidden2',
  'endMaxBots',
  'endTargetScore',
  'endStagnation',
  'batchSize',
]

export function pickShared(p: Partial<SharedParams>): SharedParams {
  return {
    gamesPerFitness: p.gamesPerFitness ?? DEFAULT_SHARED.gamesPerFitness,
    sharedGameFraction: p.sharedGameFraction ?? DEFAULT_SHARED.sharedGameFraction,
    fitnessStdPenalty: p.fitnessStdPenalty ?? DEFAULT_SHARED.fitnessStdPenalty,
    maxBots: p.maxBots ?? DEFAULT_SHARED.maxBots,
    hidden1: p.hidden1 ?? DEFAULT_SHARED.hidden1,
    hidden2: p.hidden2 ?? DEFAULT_SHARED.hidden2,
    endMaxBots: p.endMaxBots ?? DEFAULT_SHARED.endMaxBots,
    endTargetScore: p.endTargetScore ?? DEFAULT_SHARED.endTargetScore,
    endStagnation: p.endStagnation ?? DEFAULT_SHARED.endStagnation,
    batchSize: p.batchSize ?? DEFAULT_SHARED.batchSize,
  }
}

export function pickLeaderboard(p: Partial<LeaderboardParams>): LeaderboardParams {
  return {
    k: p.k ?? DEFAULT_LEADERBOARD.k,
    seedCount: p.seedCount ?? DEFAULT_LEADERBOARD.seedCount,
    pMut: p.pMut ?? DEFAULT_LEADERBOARD.pMut,
    mutSigma: p.mutSigma ?? DEFAULT_LEADERBOARD.mutSigma,
    pCrossover: p.pCrossover ?? DEFAULT_LEADERBOARD.pCrossover,
  }
}

export function leaderboardAsRecord(p: LeaderboardParams): Record<string, number> {
  return {
    k: p.k,
    seedCount: p.seedCount,
    pMut: p.pMut,
    mutSigma: p.mutSigma,
    pCrossover: p.pCrossover,
  }
}

export const BYTES_PER_FLOAT = 4
export const ROW_OVERHEAD_BYTES = 64

export function estimateStorageBytes(genomeLen: number, maxBots: number): number {
  return maxBots * (genomeLen * BYTES_PER_FLOAT + ROW_OVERHEAD_BYTES)
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`
}
