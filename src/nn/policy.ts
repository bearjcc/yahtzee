import type { NetDecision } from '../games/types.ts'
import { createScratch, forwardInto, type ForwardScratch, type NetShape } from './network.ts'
import { MAX_DICE, NUM_CATEGORIES, OUT, OUTPUT_SIZE } from './layout.ts'

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

function argmaxRange(logits: Float32Array, offset: number, len: number): number {
  let best = 0
  let bestVal = -Infinity
  for (let i = 0; i < len; i++) {
    const val = logits[offset + i]!
    if (val > bestVal) {
      bestVal = val
      best = i
    }
  }
  return best
}

/** Decode shared output head into a NetDecision. */
export function decodeOutputs(out: Float32Array, categoryMask?: boolean[]): NetDecision {
  if (out.length !== OUTPUT_SIZE) throw new Error('bad output size')
  const held = new Array<boolean>(MAX_DICE)
  for (let i = 0; i < MAX_DICE; i++) held[i] = out[OUT.hold + i]! > 0
  const categoryIndex = categoryMask
    ? argmaxMasked(out, OUT.category, categoryMask)
    : argmaxRange(out, OUT.category, NUM_CATEGORIES)
  return {
    held,
    bankOrScore: out[OUT.bankOrScore]! > 0,
    categoryIndex,
  }
}

/**
 * Run the net for one decision: caller fills input via encodeInto; returns logits.
 */
export function actFromEncode(
  encodeInto: (v: Float32Array) => void,
  genome: Float32Array,
  shape: NetShape,
  scratch?: ForwardScratch,
): Float32Array {
  const buf = scratch ?? createScratch(shape)
  buf.input.fill(0)
  encodeInto(buf.input)
  return forwardInto(genome, shape, buf.input, buf)
}
