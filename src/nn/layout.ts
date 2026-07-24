/** Shared policy I/O layout padded for all dice games. */

export const MAX_DICE = 12
export const NUM_GAMES = 4
export const NUM_CATEGORIES = 24

/** Input region offsets. */
export const IN = {
  dice: 0, // MAX_DICE
  faceCounts: 12, // 6 faces (Yahtzee / PYL)
  rollsOrRisk: 18, // 2
  gameOneHot: 20, // NUM_GAMES
  yahtzeeCard: 24, // SCORECARD_SIZE (Yahtzee + Goblin scorecard features)
  pylProgress: 80, // 3
} as const

/** Shared scorecard feature region (Goblin needs 56; Yahtzee pads unused tail). */
export const SCORECARD_SIZE = 56
/** @deprecated Use SCORECARD_SIZE */
export const YAHTZEE_CARD_SIZE = SCORECARD_SIZE
export const PYL_PROGRESS_SIZE = 3
export const ROLLS_OR_RISK_SIZE = 2

export const INPUT_SIZE =
  MAX_DICE + 6 + ROLLS_OR_RISK_SIZE + NUM_GAMES + SCORECARD_SIZE + PYL_PROGRESS_SIZE // 83

/** Output region offsets. */
export const OUT = {
  hold: 0, // MAX_DICE
  bankOrScore: 12, // 1
  category: 13, // NUM_CATEGORIES
} as const

export const OUTPUT_SIZE = MAX_DICE + 1 + NUM_CATEGORIES // 37
