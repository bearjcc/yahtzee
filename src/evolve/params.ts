export interface EvolveParams {
  k: number
  seedCount: number
  gamesPerFitness: number
  pMut: number
  mutSigma: number
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

export const DEFAULT_PARAMS: EvolveParams = {
  k: 1.5,
  seedCount: 50,
  gamesPerFitness: 2,
  pMut: 0.05,
  mutSigma: 0.15,
  maxBots: 2000,
  hidden1: 48,
  hidden2: 32,
  endMaxBots: 500,
  endTargetScore: 0,
  endStagnation: 0,
  batchSize: 8,
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
