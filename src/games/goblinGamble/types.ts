/** Fixed polyhedral set: 2 each of d4, d6, d8, d10, d12, d20. */
export const DIE_SIDES = [4, 4, 6, 6, 8, 8, 10, 10, 12, 12, 20, 20] as const
export const DICE_COUNT = DIE_SIDES.length

export const CATEGORIES = [
  'ones',
  'twos',
  'threes',
  'fours',
  'fives',
  'sixes',
  'sevens',
  'eights',
  'nines',
  'tens',
  'magicMissile',
  'partyOfFour',
  'fireball',
  'balancedParty',
  'initiative',
  'dungeonCrawl',
  'polymorph',
  'minMax',
  'success',
  'criticalSuccess',
  'failure',
  'criticalFailure',
  'twinnedSpell',
  'bagOfHolding',
] as const

export type Category = (typeof CATEGORIES)[number]

export const UPPER_SECTION = [
  'ones',
  'twos',
  'threes',
  'fours',
  'fives',
  'sixes',
  'sevens',
  'eights',
  'nines',
  'tens',
] as const satisfies readonly Category[]

export const LOWER_SECTION = [
  'magicMissile',
  'partyOfFour',
  'fireball',
  'balancedParty',
  'initiative',
  'dungeonCrawl',
  'polymorph',
  'minMax',
  'success',
  'criticalSuccess',
  'failure',
  'criticalFailure',
  'twinnedSpell',
  'bagOfHolding',
] as const satisfies readonly Category[]

export type UpperCategory = (typeof UPPER_SECTION)[number]

export const UPPER_FACE: Record<UpperCategory, number> = {
  ones: 1,
  twos: 2,
  threes: 3,
  fours: 4,
  fives: 5,
  sixes: 6,
  sevens: 7,
  eights: 8,
  nines: 9,
  tens: 10,
}

export const INSPIRATION_THRESHOLD = 80
export const INSPIRATION_POINTS = 35

export const POLYMORPH_SCORE = 50
export const CRITICAL_FAILURE_SCORE = 250
export const CRITICAL_SUCCESS_SCORE = 100
export const MIN_MAX_SCORE = 50
export const SUCCESS_SCORE = 40
export const FAILURE_SCORE = 35
export const TWINNED_SPELL_SCORE = 45
export const BALANCED_PARTY_SCORE = 30
export const INITIATIVE_SCORE = 30
export const DUNGEON_CRAWL_SCORE = 45

export type Scorecard = Record<Category, number | null>

export interface GameState {
  dice: number[]
  held: boolean[]
  rollsRemaining: number
  scorecard: Scorecard
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
    dice: Array.from({ length: DICE_COUNT }, () => 1),
    held: Array.from({ length: DICE_COUNT }, () => false),
    rollsRemaining: 3,
    scorecard: emptyScorecard(),
    turn: 1,
    gameOver: false,
    hasRolled: false,
  }
}
