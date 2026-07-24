import type { Rng } from '../engine/rng.ts'
import { rollDie } from '../engine/rng.ts'
import { faceCounts } from './dice.ts'
import { IN } from '../nn/layout.ts'
import {
  canScore,
  resolveSetAside,
  type PylScoringMode,
} from './pylScoring.ts'
import { decodeOutputs } from '../nn/policy.ts'
import type { ActFn, PylEpisodeResult } from './types.ts'

export type PylConfig = {
  mode: PylScoringMode
  goal: number
  oneHotIndex: number
  /** Safety cap so a broken policy cannot spin forever. */
  maxTurns?: number
}

export type PylState = {
  dice: number[]
  diceInHand: number
  turnPoints: number
  banked: number
  turns: number
  goal: number
  hasRolled: boolean
}

function encodePylInto(
  state: PylState,
  mode: PylScoringMode,
  oneHotIndex: number,
  v: Float32Array,
): void {
  v.fill(0)
  const n = state.dice.length
  for (let d = 0; d < n; d++) v[IN.dice + d] = state.dice[d]! / 6

  const counts = faceCounts(state.dice)
  for (let f = 1; f <= 6; f++) v[IN.faceCounts + (f - 1)] = counts[f]! / 6

  v[IN.rollsOrRisk + 0] = state.turnPoints / state.goal
  v[IN.rollsOrRisk + 1] = state.diceInHand / 6

  v[IN.gameOneHot + oneHotIndex] = 1

  v[IN.pylProgress + 0] = state.banked / state.goal
  v[IN.pylProgress + 1] = Math.min(state.turns, 100) / 100
  v[IN.pylProgress + 2] = canScore(state.dice, mode) ? 1 : 0
}

function rollHand(count: number, rng: Rng): number[] {
  const dice = new Array<number>(count)
  for (let i = 0; i < count; i++) dice[i] = rollDie(rng)
  return dice
}

export function playPyl(rng: Rng, act: ActFn, cfg: PylConfig): PylEpisodeResult {
  const maxTurns = cfg.maxTurns ?? 500
  let banked = 0
  let turns = 0

  while (banked < cfg.goal && turns < maxTurns) {
    turns++
    let turnPoints = 0
    let diceInHand = 6
    let dice = rollHand(diceInHand, rng)

    for (;;) {
      if (!canScore(dice, cfg.mode)) {
        turnPoints = 0
        break
      }

      const state: PylState = {
        dice,
        diceInHand,
        turnPoints,
        banked,
        turns,
        goal: cfg.goal,
        hasRolled: true,
      }
      const out = act((v) => encodePylInto(state, cfg.mode, cfg.oneHotIndex, v))
      const net = decodeOutputs(out)
      const resolved = resolveSetAside(dice, net.held, cfg.mode)
      if (resolved.points <= 0) {
        turnPoints = 0
        break
      }

      turnPoints += resolved.points
      const remaining: number[] = []
      for (let i = 0; i < dice.length; i++) {
        if (!resolved.mask[i]) remaining.push(dice[i]!)
      }

      if (remaining.length === 0) {
        diceInHand = 6
      } else {
        diceInHand = remaining.length
      }

      if (net.bankOrScore) {
        banked += turnPoints
        break
      }

      dice = rollHand(diceInHand, rng)
    }
  }

  const turnsUsed = Math.max(1, turns)
  const total = cfg.goal / turnsUsed
  return {
    kind: 'pyl',
    total,
    banked: Math.min(banked, cfg.goal),
    turns: turnsUsed,
    goal: cfg.goal,
  }
}
