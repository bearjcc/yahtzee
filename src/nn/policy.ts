import {
  CATEGORIES,
  openCategories,
  type Decision,
  type GameState,
} from '../engine/index.ts'
import { encodeStateInto, OUTPUT_SIZE } from './encode.ts'
import { createScratch, forwardInto, type ForwardScratch, type NetShape } from './network.ts'

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

const categoryMask = new Array<boolean>(CATEGORIES.length).fill(false)
const categoryIndex = new Map<string, number>(CATEGORIES.map((c, i) => [c, i]))

export function decide(
  state: GameState,
  genome: Float32Array,
  shape: NetShape,
  scratch?: ForwardScratch,
): Decision {
  const buf = scratch ?? createScratch(shape)
  encodeStateInto(state, buf.input)
  const out = forwardInto(genome, shape, buf.input, buf)
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
  for (let i = 0; i < CATEGORIES.length; i++) categoryMask[i] = false
  for (const c of legal) categoryMask[categoryIndex.get(c)!] = true
  const catIdx = argmaxMasked(out, 6, categoryMask)
  const category = CATEGORIES[catIdx]!

  return { scoreNow, held, category }
}
