/** Shared policy I/O layout padded for all dice games. */

export const MAX_DICE = 6
export const NUM_GAMES = 3
export const NUM_CATEGORIES = 13

/** Input region offsets. */
export const IN = {
  dice: 0, // MAX_DICE
  faceCounts: 6, // 6 faces
  rollsOrRisk: 12, // 2
  gameOneHot: 14, // NUM_GAMES
  yahtzeeCard: 17, // 33
  pylProgress: 50, // 3
} as const

export const YAHTZEE_CARD_SIZE = 33
export const PYL_PROGRESS_SIZE = 3
export const ROLLS_OR_RISK_SIZE = 2

export const INPUT_SIZE =
  MAX_DICE + 6 + ROLLS_OR_RISK_SIZE + NUM_GAMES + YAHTZEE_CARD_SIZE + PYL_PROGRESS_SIZE // 53

/** Output region offsets. */
export const OUT = {
  hold: 0, // MAX_DICE
  bankOrScore: 6, // 1
  category: 7, // NUM_CATEGORIES
} as const

export const OUTPUT_SIZE = MAX_DICE + 1 + NUM_CATEGORIES // 20
