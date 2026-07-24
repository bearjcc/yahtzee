import type { Rng } from '../engine/rng.ts'

export const GAME_IDS = ['yahtzee', 'farkle', 'sixCubes', 'goblinGamble'] as const
export type GameId = (typeof GAME_IDS)[number]

export const DEFAULT_GAME_IDS: GameId[] = ['yahtzee']

/** Shared action head decoded from the policy net. */
export type NetDecision = {
  /** Length MAX_DICE; unused slots ignored by smaller-dice games. */
  held: boolean[]
  /** Yahtzee / Goblin: score now. Farkle / 6 Cubes: bank turn points. */
  bankOrScore: boolean
  /** Scorecard category index; ignored by push-your-luck games. */
  categoryIndex: number
}

/**
 * Callback the engine uses each decision point.
 * `encodeInto` must write the shared input vector (incl. game one-hot).
 * Returns raw network outputs for the active game to interpret.
 */
export type ActFn = (encodeInto: (v: Float32Array) => void) => Float32Array

export type YahtzeeEpisodeResult = {
  kind: 'yahtzee'
  total: number
  scorecard: Record<string, number | null>
  yahtzeeBonuses: number
}

export type GoblinEpisodeResult = {
  kind: 'goblinGamble'
  total: number
  scorecard: Record<string, number | null>
  inspiration: number
}

export type PylEpisodeResult = {
  kind: 'pyl'
  /** Fitness scalar (goal / turns). */
  total: number
  banked: number
  turns: number
  goal: number
}

export type EpisodeResult = YahtzeeEpisodeResult | GoblinEpisodeResult | PylEpisodeResult

export interface GameModule {
  readonly id: GameId
  readonly label: string
  readonly diceCount: number
  /** Index into the shared game one-hot (0..NUM_GAMES-1). */
  readonly oneHotIndex: number
  /** Target banked score for push-your-luck games; undefined for scorecard games. */
  readonly goalScore?: number
  /** Play one episode; return fitness scalar. */
  play(rng: Rng, act: ActFn): number
  /** Play one episode with UI/replay details. */
  playResult(rng: Rng, act: ActFn): EpisodeResult
}

export function isGameId(v: unknown): v is GameId {
  return typeof v === 'string' && (GAME_IDS as readonly string[]).includes(v)
}

export function normalizeGameIds(ids: unknown): GameId[] {
  if (!Array.isArray(ids) || ids.length === 0) return [...DEFAULT_GAME_IDS]
  const out: GameId[] = []
  for (const id of ids) {
    if (isGameId(id) && !out.includes(id)) out.push(id)
  }
  return out.length > 0 ? out : [...DEFAULT_GAME_IDS]
}
