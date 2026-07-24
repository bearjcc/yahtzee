import { describe, expect, it } from 'vitest'
import {
  applyScore,
  isJokerSituation,
  legalCategories,
  rawCategoryScore,
  totalScore,
  upperTotal,
} from './scoring.ts'
import { emptyScorecard, newGame, type GameState } from './types.ts'

function stateWith(dice: number[], scorecardPartial: Partial<GameState['scorecard']> = {}): GameState {
  const s = newGame()
  s.dice = dice
  s.hasRolled = true
  s.rollsRemaining = 0
  for (const [k, v] of Object.entries(scorecardPartial)) {
    s.scorecard[k as keyof typeof s.scorecard] = v as number | null
  }
  return s
}

describe('rawCategoryScore', () => {
  it('scores upper faces', () => {
    expect(rawCategoryScore([1, 1, 2, 3, 1], 'aces')).toBe(3)
    expect(rawCategoryScore([6, 6, 6, 1, 2], 'sixes')).toBe(18)
  })

  it('scores full house and straights', () => {
    expect(rawCategoryScore([2, 2, 3, 3, 3], 'fullHouse')).toBe(25)
    expect(rawCategoryScore([1, 2, 3, 4, 6], 'smallStraight')).toBe(30)
    expect(rawCategoryScore([2, 3, 4, 5, 6], 'largeStraight')).toBe(40)
    expect(rawCategoryScore([1, 1, 1, 1, 1], 'fullHouse')).toBe(0)
  })

  it('scores yahtzee and kinds', () => {
    expect(rawCategoryScore([5, 5, 5, 5, 5], 'yahtzee')).toBe(50)
    expect(rawCategoryScore([4, 4, 4, 1, 2], 'threeOfAKind')).toBe(15)
    expect(rawCategoryScore([4, 4, 4, 4, 2], 'fourOfAKind')).toBe(18)
  })
})

describe('upper bonus', () => {
  it('adds 35 when upper >= 63', () => {
    const s = newGame()
    s.scorecard.aces = 3
    s.scorecard.twos = 6
    s.scorecard.threes = 9
    s.scorecard.fours = 12
    s.scorecard.fives = 15
    s.scorecard.sixes = 18
    expect(upperTotal(s.scorecard)).toBe(63)
    for (const c of [
      'threeOfAKind',
      'fourOfAKind',
      'fullHouse',
      'smallStraight',
      'largeStraight',
      'yahtzee',
      'chance',
    ] as const) {
      s.scorecard[c] = 0
    }
    expect(totalScore(s)).toBe(63 + 35)
  })
})

describe('joker and yahtzee bonus', () => {
  it('forces upper box when open under joker', () => {
    const s = stateWith([4, 4, 4, 4, 4], { yahtzee: 50 })
    expect(isJokerSituation(s)).toBe(true)
    expect(legalCategories(s)).toEqual(['fours'])
  })

  it('allows lower joker scores when upper filled', () => {
    const s = stateWith([4, 4, 4, 4, 4], { yahtzee: 50, fours: 12 })
    const legal = legalCategories(s)
    expect(legal).toContain('fullHouse')
    expect(legal).toContain('largeStraight')
    const next = applyScore(s, 'fullHouse')
    expect(next.scorecard.fullHouse).toBe(25)
    expect(next.yahtzeeBonuses).toBe(1)
    expect(totalScore(next)).toBe(50 + 12 + 25 + 100)
  })

  it('no bonus chip when yahtzee box was zero', () => {
    const s = stateWith([3, 3, 3, 3, 3], { yahtzee: 0, threes: 9 })
    const next = applyScore(s, 'chance')
    expect(next.yahtzeeBonuses).toBe(0)
    expect(next.scorecard.chance).toBe(15)
  })

  it('must zero an upper when only uppers left under joker', () => {
    const card = emptyScorecard()
    card.yahtzee = 50
    card.fours = 16
    for (const c of [
      'threeOfAKind',
      'fourOfAKind',
      'fullHouse',
      'smallStraight',
      'largeStraight',
      'chance',
    ] as const) {
      card[c] = 0
    }
    const s = stateWith([4, 4, 4, 4, 4])
    s.scorecard = card
    const legal = legalCategories(s)
    expect(legal.every((c) => ['aces', 'twos', 'threes', 'fives', 'sixes'].includes(c))).toBe(true)
  })
})
