import { faceCounts } from '../dice.ts'
import {
  CATEGORIES,
  LOWER_SECTION,
  UPPER_BONUS_POINTS,
  UPPER_BONUS_THRESHOLD,
  UPPER_FACE,
  UPPER_SECTION,
  YAHTZEE_BONUS_CHIP,
  YAHTZEE_SCORE,
  type Category,
  type GameState,
  type Scorecard,
} from './types.ts'

export { faceCounts }

export function isYahtzee(dice: number[]): boolean {
  const c = faceCounts(dice)
  for (let f = 1; f <= 6; f++) if (c[f] === 5) return true
  return false
}

export function yahtzeeFace(dice: number[]): number | null {
  const c = faceCounts(dice)
  for (let f = 1; f <= 6; f++) if (c[f] === 5) return f
  return null
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

function uniqueFaces(dice: number[]): number[] {
  const seen = new Set(dice)
  return [...seen].sort((a, b) => a - b)
}

export function categoryMaxScore(category: Category): number {
  switch (category) {
    case 'aces':
      return 5
    case 'twos':
      return 10
    case 'threes':
      return 15
    case 'fours':
      return 20
    case 'fives':
      return 25
    case 'sixes':
      return 30
    case 'threeOfAKind':
    case 'fourOfAKind':
    case 'chance':
      return 30
    case 'fullHouse':
      return 25
    case 'smallStraight':
      return 30
    case 'largeStraight':
      return 40
    case 'yahtzee':
      return 50
  }
}

/** Raw category score without joker overrides. */
export function rawCategoryScore(dice: number[], category: Category): number {
  const counts = faceCounts(dice)
  const sum = dice.reduce((a, b) => a + b, 0)
  const maxCount = Math.max(...counts.slice(1))

  switch (category) {
    case 'aces':
    case 'twos':
    case 'threes':
    case 'fours':
    case 'fives':
    case 'sixes': {
      const face = UPPER_FACE[category]
      return face * counts[face]!
    }
    case 'threeOfAKind':
      return maxCount >= 3 ? sum : 0
    case 'fourOfAKind':
      return maxCount >= 4 ? sum : 0
    case 'fullHouse': {
      const vals = counts.slice(1).filter((n) => n > 0).sort((a, b) => b - a)
      return vals[0] === 3 && vals[1] === 2 ? 25 : 0
    }
    case 'smallStraight':
      return hasSequence(uniqueFaces(dice), 4) ? 30 : 0
    case 'largeStraight':
      return hasSequence(uniqueFaces(dice), 5) ? 40 : 0
    case 'yahtzee':
      return maxCount === 5 ? YAHTZEE_SCORE : 0
    case 'chance':
      return sum
  }
}

export function isJokerSituation(state: GameState): boolean {
  return isYahtzee(state.dice) && state.scorecard.yahtzee !== null
}

/** Categories legal to score given current dice and scorecard (incl. joker). */
export function legalCategories(state: GameState): Category[] {
  const open = CATEGORIES.filter((c) => state.scorecard[c] === null)
  if (!isJokerSituation(state)) return open

  const face = yahtzeeFace(state.dice)!
  const upperCat = UPPER_SECTION[face - 1]!
  if (state.scorecard[upperCat] === null) return [upperCat]

  const openLower = LOWER_SECTION.filter((c) => state.scorecard[c] === null)
  if (openLower.length > 0) return openLower

  return UPPER_SECTION.filter((c) => state.scorecard[c] === null)
}

export function scoreForCategory(state: GameState, category: Category): number {
  if (state.scorecard[category] !== null) {
    throw new Error(`Category already filled: ${category}`)
  }
  const legal = legalCategories(state)
  if (!legal.includes(category)) {
    throw new Error(`Illegal category ${category} for current dice`)
  }

  if (isJokerSituation(state)) {
    if ((UPPER_SECTION as readonly string[]).includes(category)) {
      const face = UPPER_FACE[category as (typeof UPPER_SECTION)[number]]
      return face * 5
    }
    switch (category) {
      case 'fullHouse':
        return 25
      case 'smallStraight':
        return 30
      case 'largeStraight':
        return 40
      case 'threeOfAKind':
      case 'fourOfAKind':
      case 'chance':
        return state.dice.reduce((a, b) => a + b, 0)
      case 'yahtzee':
        return YAHTZEE_SCORE
      default:
        return 0
    }
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

export function totalScore(state: GameState): number {
  let t = 0
  for (const c of CATEGORIES) {
    const v = state.scorecard[c]
    if (v !== null) t += v
  }
  if (upperTotal(state.scorecard) >= UPPER_BONUS_THRESHOLD) t += UPPER_BONUS_POINTS
  t += state.yahtzeeBonuses * YAHTZEE_BONUS_CHIP
  return t
}

export function applyScoreMut(state: GameState, category: Category): void {
  if (isYahtzee(state.dice) && state.scorecard.yahtzee === YAHTZEE_SCORE) {
    state.yahtzeeBonuses += 1
  }

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
  state.held[0] = false
  state.held[1] = false
  state.held[2] = false
  state.held[3] = false
  state.held[4] = false
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
