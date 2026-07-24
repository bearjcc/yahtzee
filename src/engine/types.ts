export const CATEGORIES = [
  'aces',
  'twos',
  'threes',
  'fours',
  'fives',
  'sixes',
  'threeOfAKind',
  'fourOfAKind',
  'fullHouse',
  'smallStraight',
  'largeStraight',
  'yahtzee',
  'chance',
] as const

export type Category = (typeof CATEGORIES)[number]

export const UPPER_SECTION = [
  'aces',
  'twos',
  'threes',
  'fours',
  'fives',
  'sixes',
] as const satisfies readonly Category[]

export const LOWER_SECTION = [
  'threeOfAKind',
  'fourOfAKind',
  'fullHouse',
  'smallStraight',
  'largeStraight',
  'yahtzee',
  'chance',
] as const satisfies readonly Category[]

export type UpperCategory = (typeof UPPER_SECTION)[number]

export const UPPER_FACE: Record<UpperCategory, number> = {
  aces: 1,
  twos: 2,
  threes: 3,
  fours: 4,
  fives: 5,
  sixes: 6,
}

export const UPPER_BONUS_THRESHOLD = 63
export const UPPER_BONUS_POINTS = 35
export const YAHTZEE_SCORE = 50
export const YAHTZEE_BONUS_CHIP = 100

export type Scorecard = Record<Category, number | null>

export interface GameState {
  dice: number[]
  held: boolean[]
  rollsRemaining: number
  scorecard: Scorecard
  yahtzeeBonuses: number
  turn: number
  gameOver: boolean
  /** True after at least one roll this turn (policy sees dice). */
  hasRolled: boolean
}

export function emptyScorecard(): Scorecard {
  const card = {} as Scorecard
  for (const c of CATEGORIES) card[c] = null
  return card
}

export function newGame(): GameState {
  return {
    dice: [1, 1, 1, 1, 1],
    held: [false, false, false, false, false],
    rollsRemaining: 3,
    scorecard: emptyScorecard(),
    yahtzeeBonuses: 0,
    turn: 1,
    gameOver: false,
    hasRolled: false,
  }
}
