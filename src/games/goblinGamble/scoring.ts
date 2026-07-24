import { sumDice } from '../dice.ts'
import {
  BALANCED_PARTY_SCORE,
  CATEGORIES,
  CRITICAL_FAILURE_SCORE,
  CRITICAL_SUCCESS_SCORE,
  DIE_SIDES,
  DUNGEON_CRAWL_SCORE,
  FAILURE_SCORE,
  INITIATIVE_SCORE,
  INSPIRATION_POINTS,
  INSPIRATION_THRESHOLD,
  LOWER_SECTION,
  MIN_MAX_SCORE,
  POLYMORPH_SCORE,
  SUCCESS_SCORE,
  TWINNED_SPELL_SCORE,
  UPPER_FACE,
  UPPER_SECTION,
  type Category,
  type GameState,
  type Scorecard,
  type UpperCategory,
} from './types.ts'

const MAX_FACE = 20

/** Counts for faces 1..20 (index 0 unused). */
export function faceCounts20(dice: number[]): number[] {
  const counts = new Array<number>(MAX_FACE + 1).fill(0)
  for (const d of dice) {
    if (d >= 1 && d <= MAX_FACE) counts[d]!++
  }
  return counts
}

function maxOfAKind(counts: number[]): number {
  let m = 0
  for (let f = 1; f <= MAX_FACE; f++) if (counts[f]! > m) m = counts[f]!
  return m
}

function uniqueSortedFaces(dice: number[]): number[] {
  const seen = new Set(dice)
  return [...seen].sort((a, b) => a - b)
}

function hasSequence(uniqueSorted: number[], len: number): boolean {
  if (uniqueSorted.length < len) return false
  for (let start = 0; start <= uniqueSorted.length - len; start++) {
    let ok = true
    for (let i = 1; i < len; i++) {
      if (uniqueSorted[start + i] !== uniqueSorted[start]! + i) {
        ok = false
        break
      }
    }
    if (ok) return true
  }
  return false
}

/** At least one triple and a distinct pair (or second triple) among faces. */
function isFullHouse(counts: number[]): boolean {
  let hasTriple = false
  let hasPair = false
  for (let f = 1; f <= MAX_FACE; f++) {
    const n = counts[f]!
    if (n >= 3) {
      if (hasTriple) hasPair = true
      else hasTriple = true
    } else if (n >= 2) {
      hasPair = true
    }
  }
  return hasTriple && hasPair
}

/** Die-type pairs: indices (0,1), (2,3), ... */
export function dieTypePairs(): readonly (readonly [number, number])[] {
  return [
    [0, 1],
    [2, 3],
    [4, 5],
    [6, 7],
    [8, 9],
    [10, 11],
  ]
}

export function isMinMax(dice: number[]): boolean {
  for (const [a, b] of dieTypePairs()) {
    const sides = DIE_SIDES[a]!
    const lo = Math.min(dice[a]!, dice[b]!)
    const hi = Math.max(dice[a]!, dice[b]!)
    if (lo !== 1 || hi !== sides) return false
  }
  return true
}

export function isSuccess(dice: number[]): boolean {
  for (const [a, b] of dieTypePairs()) {
    const sides = DIE_SIDES[a]!
    if (dice[a] !== sides && dice[b] !== sides) return false
  }
  return true
}

export function isCriticalSuccess(dice: number[]): boolean {
  for (let i = 0; i < DIE_SIDES.length; i++) {
    if (dice[i] !== DIE_SIDES[i]) return false
  }
  return true
}

export function isFailure(dice: number[]): boolean {
  for (const [a, b] of dieTypePairs()) {
    if (dice[a] !== 1 && dice[b] !== 1) return false
  }
  return true
}

export function isCriticalFailure(dice: number[]): boolean {
  for (const d of dice) if (d !== 1) return false
  return true
}

export function isTwinnedSpell(dice: number[]): boolean {
  for (const [a, b] of dieTypePairs()) {
    if (dice[a] !== dice[b]) return false
  }
  return true
}

export function isPolymorph(dice: number[]): boolean {
  if (dice.length === 0) return false
  const face = dice[0]!
  for (let i = 1; i < dice.length; i++) if (dice[i] !== face) return false
  return true
}

/** Max theoretical sum of all dice (all max faces). */
export const BAG_OF_HOLDING_MAX = DIE_SIDES.reduce((a, s) => a + s, 0)

export function categoryMaxScore(category: Category): number {
  switch (category) {
    case 'ones':
      return 1 * 12
    case 'twos':
      return 2 * 12
    case 'threes':
      return 3 * 12
    case 'fours':
      return 4 * 12
    case 'fives':
      return 5 * 10
    case 'sixes':
      return 6 * 10
    case 'sevens':
      return 7 * 8
    case 'eights':
      return 8 * 8
    case 'nines':
      return 9 * 6
    case 'tens':
      return 10 * 6
    case 'magicMissile':
    case 'partyOfFour':
    case 'fireball':
    case 'bagOfHolding':
      return BAG_OF_HOLDING_MAX
    case 'balancedParty':
      return BALANCED_PARTY_SCORE
    case 'initiative':
      return INITIATIVE_SCORE
    case 'dungeonCrawl':
      return DUNGEON_CRAWL_SCORE
    case 'polymorph':
      return POLYMORPH_SCORE
    case 'minMax':
      return MIN_MAX_SCORE
    case 'success':
      return SUCCESS_SCORE
    case 'criticalSuccess':
      return CRITICAL_SUCCESS_SCORE
    case 'failure':
      return FAILURE_SCORE
    case 'criticalFailure':
      return CRITICAL_FAILURE_SCORE
    case 'twinnedSpell':
      return TWINNED_SPELL_SCORE
  }
}

export function rawCategoryScore(dice: number[], category: Category): number {
  const counts = faceCounts20(dice)
  const sum = sumDice(dice)
  const maxKind = maxOfAKind(counts)

  if ((UPPER_SECTION as readonly string[]).includes(category)) {
    const face = UPPER_FACE[category as UpperCategory]
    return face * counts[face]!
  }

  switch (category) {
    case 'magicMissile':
      return maxKind >= 3 ? sum : 0
    case 'partyOfFour':
      return maxKind >= 4 ? sum : 0
    case 'fireball':
      return maxKind >= 5 ? sum : 0
    case 'balancedParty':
      return isFullHouse(counts) ? BALANCED_PARTY_SCORE : 0
    case 'initiative':
      return hasSequence(uniqueSortedFaces(dice), 5) ? INITIATIVE_SCORE : 0
    case 'dungeonCrawl':
      return hasSequence(uniqueSortedFaces(dice), 8) ? DUNGEON_CRAWL_SCORE : 0
    case 'polymorph':
      return isPolymorph(dice) ? POLYMORPH_SCORE : 0
    case 'minMax':
      return isMinMax(dice) ? MIN_MAX_SCORE : 0
    case 'success':
      return isSuccess(dice) ? SUCCESS_SCORE : 0
    case 'criticalSuccess':
      return isCriticalSuccess(dice) ? CRITICAL_SUCCESS_SCORE : 0
    case 'failure':
      return isFailure(dice) ? FAILURE_SCORE : 0
    case 'criticalFailure':
      return isCriticalFailure(dice) ? CRITICAL_FAILURE_SCORE : 0
    case 'twinnedSpell':
      return isTwinnedSpell(dice) ? TWINNED_SPELL_SCORE : 0
    case 'bagOfHolding':
      return sum
    default:
      return 0
  }
}

export function legalCategories(state: GameState): Category[] {
  return CATEGORIES.filter((c) => state.scorecard[c] === null)
}

export function scoreForCategory(state: GameState, category: Category): number {
  if (state.scorecard[category] !== null) {
    throw new Error(`Category already filled: ${category}`)
  }
  return rawCategoryScore(state.dice, category)
}

export function upperTotal(scorecard: Scorecard): number {
  let t = 0
  for (const c of UPPER_SECTION) {
    const v = scorecard[c]
    if (v !== null) t += v
  }
  return t
}

export function lowerTotal(scorecard: Scorecard): number {
  let t = 0
  for (const c of LOWER_SECTION) {
    const v = scorecard[c]
    if (v !== null) t += v
  }
  return t
}

export function inspirationBonus(scorecard: Scorecard): number {
  return upperTotal(scorecard) >= INSPIRATION_THRESHOLD ? INSPIRATION_POINTS : 0
}

export function totalScore(state: GameState): number {
  let t = 0
  for (const c of CATEGORIES) {
    const v = state.scorecard[c]
    if (v !== null) t += v
  }
  t += inspirationBonus(state.scorecard)
  return t
}

export function applyScoreMut(state: GameState, category: Category): void {
  state.scorecard[category] = scoreForCategory(state, category)

  let filled = true
  for (const c of CATEGORIES) {
    if (state.scorecard[c] === null) {
      filled = false
      break
    }
  }
  state.turn += 1
  state.gameOver = filled
  state.rollsRemaining = 3
  for (let i = 0; i < state.held.length; i++) state.held[i] = false
  state.hasRolled = false
}

export function applyScore(state: GameState, category: Category): GameState {
  const next: GameState = {
    ...state,
    dice: state.dice.slice(),
    held: state.held.slice(),
    scorecard: { ...state.scorecard },
  }
  applyScoreMut(next, category)
  return next
}
