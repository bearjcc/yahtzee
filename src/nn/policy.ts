import {
  CATEGORIES,
  openCategories,
  type Decision,
  type GameState,
} from '../engine/index.ts'
import { encodeState, OUTPUT_SIZE } from './encode.ts'
import { forward, type NetShape } from './network.ts'

function argmaxMasked(logits: Float32Array, offset: number, mask: boolean[]): number {
  let best = -1
  let bestVal = -Infinity
  for (let i = 0; i < mask.length; i++) {
    if (!mask[i]) continue
    const val = logits[offset + i]!
    if (val > bestVal) {
      bestVal = val
      best = i
    }
  }
  return best < 0 ? 0 : best
}

export function decide(state: GameState, genome: Float32Array, shape: NetShape): Decision {
  const input = encodeState(state)
  const out = forward(genome, shape, input)
  if (out.length !== OUTPUT_SIZE) throw new Error('bad output size')

  const held = [
    out[0]! > 0,
    out[1]! > 0,
    out[2]! > 0,
    out[3]! > 0,
    out[4]! > 0,
  ]
  const scoreNow = state.rollsRemaining > 0 && out[5]! > 0

  const legal = openCategories(state)
  const mask = CATEGORIES.map((c) => legal.includes(c))
  const catIdx = argmaxMasked(out, 6, mask)
  const category = CATEGORIES[catIdx]!

  return { scoreNow, held, category }
}
