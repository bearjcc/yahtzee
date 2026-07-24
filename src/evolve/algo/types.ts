import type { GameId } from '../../games/types.ts'
import type { NetShape } from '../../nn/index.ts'
import type { Archive, BotRecord } from '../archive.ts'
import type { SharedParams } from '../params.ts'

export type ParamField = {
  key: string
  label: string
  default: number
  step?: string
  span2?: boolean
  /** Clamp hint for the form reader. */
  min?: number
  max?: number
  integer?: boolean
}

export type TableColumn = {
  key: string
  label: string
}

export type TrainCandidate = {
  genome: Float32Array
  parentA: number | null
  parentB: number | null
  meta?: Record<string, string | number | null>
}

export type RunConfig = {
  algorithmId: string
  /** One or more games; bot plays gamesPerFitness episodes for each. */
  gameIds: GameId[]
  shared: SharedParams
  algoParams: Record<string, number>
}

export interface Algorithm {
  readonly id: string
  readonly label: string
  readonly blurb: string
  /** Algo-specific form fields (shared fields are separate). */
  readonly paramSchema: ParamField[]
  /** Extra table columns beyond Bot / Score / Games. */
  readonly tableColumns: TableColumn[]

  defaultParams(): Record<string, number>
  configure(
    shared: SharedParams,
    algoParams: Record<string, number>,
    shape: NetShape,
    rngSeed?: number,
  ): void
  /** How many random seeds to evaluate before child batches. */
  seedCount(): number
  seedBatch(count: number): TrainCandidate[]
  nextBatch(batchSize: number, archive: Archive): TrainCandidate[]
  onEvaluated(bot: BotRecord, pruned: BotRecord[]): void
  shouldStop(archive: Archive): string | null
  formatParents(bot: BotRecord): string
  cellValue(bot: BotRecord, columnKey: string): string
  serialize(): unknown
  restore(data: unknown, archive: Archive): void
}
