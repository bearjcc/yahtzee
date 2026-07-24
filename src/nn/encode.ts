import { INPUT_SIZE, OUTPUT_SIZE } from './layout.ts'

export { INPUT_SIZE, OUTPUT_SIZE, IN, OUT, MAX_DICE, NUM_GAMES, NUM_CATEGORIES } from './layout.ts'

/** Allocate a zeroed input vector of the shared size. */
export function emptyInput(): Float32Array {
  return new Float32Array(INPUT_SIZE)
}

export function emptyOutput(): Float32Array {
  return new Float32Array(OUTPUT_SIZE)
}
