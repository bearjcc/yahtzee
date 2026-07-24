import type { Rng } from '../engine/rng.ts'
import { playPyl } from './pylEngine.ts'
import type { ActFn, EpisodeResult, GameModule } from './types.ts'

export const FARKLE_GOAL = 10_000

const cfg = {
  mode: 'farkle' as const,
  goal: FARKLE_GOAL,
  oneHotIndex: 1,
}

function play(rng: Rng, act: ActFn): number {
  return playPyl(rng, act, cfg).total
}

function playResult(rng: Rng, act: ActFn): EpisodeResult {
  return playPyl(rng, act, cfg)
}

export const farkleGame: GameModule = {
  id: 'farkle',
  label: 'Farkle',
  diceCount: 6,
  oneHotIndex: 1,
  goalScore: FARKLE_GOAL,
  play,
  playResult,
}
