import type { Rng } from '../engine/rng.ts'
import { playPyl } from './pylEngine.ts'
import type { ActFn, EpisodeResult, GameModule } from './types.ts'

export const SIX_CUBES_GOAL = 5_000

const cfg = {
  mode: 'sixCubes' as const,
  goal: SIX_CUBES_GOAL,
  oneHotIndex: 2,
}

function play(rng: Rng, act: ActFn): number {
  return playPyl(rng, act, cfg).total
}

function playResult(rng: Rng, act: ActFn): EpisodeResult {
  return playPyl(rng, act, cfg)
}

export const sixCubesGame: GameModule = {
  id: 'sixCubes',
  label: '6 Cubes',
  diceCount: 6,
  oneHotIndex: 2,
  goalScore: SIX_CUBES_GOAL,
  play,
  playResult,
}
