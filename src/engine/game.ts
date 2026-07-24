import { rollDie, type Rng } from './rng.ts'
import { applyScore, applyScoreMut, legalCategories, totalScore } from './scoring.ts'
import { newGame, type Category, type GameState } from './types.ts'

export function rollDice(state: GameState, rng: Rng): GameState {
  if (state.gameOver) return state
  if (state.rollsRemaining <= 0) return state

  const dice = state.dice.slice()
  const held = state.hasRolled ? state.held : [false, false, false, false, false]
  for (let i = 0; i < 5; i++) {
    if (!held[i]) dice[i] = rollDie(rng)
  }
  return {
    ...state,
    dice,
    held: [false, false, false, false, false],
    rollsRemaining: state.rollsRemaining - 1,
    hasRolled: true,
  }
}

function rollDiceMut(state: GameState, rng: Rng): void {
  if (state.gameOver || state.rollsRemaining <= 0) return
  const held0 = state.hasRolled ? state.held : null
  for (let i = 0; i < 5; i++) {
    if (!held0 || !held0[i]) state.dice[i] = rollDie(rng)
  }
  state.held[0] = false
  state.held[1] = false
  state.held[2] = false
  state.held[3] = false
  state.held[4] = false
  state.rollsRemaining -= 1
  state.hasRolled = true
}

export function setHolds(state: GameState, held: boolean[]): GameState {
  if (!state.hasRolled || state.rollsRemaining <= 0) return state
  return { ...state, held: held.slice(0, 5) }
}

function setHoldsMut(state: GameState, held: boolean[]): void {
  if (!state.hasRolled || state.rollsRemaining <= 0) return
  for (let i = 0; i < 5; i++) state.held[i] = !!held[i]
}

export function scoreCategory(state: GameState, category: Category): GameState {
  if (!state.hasRolled || state.gameOver) return state
  return applyScore(state, category)
}

function scoreCategoryMut(state: GameState, category: Category): void {
  if (!state.hasRolled || state.gameOver) return
  applyScoreMut(state, category)
}

export function openCategories(state: GameState): Category[] {
  return legalCategories(state)
}

export type Decision = {
  scoreNow: boolean
  held: boolean[]
  category: Category
}

/** Play one full game with a decision callback; returns final score. */
export function playGame(rng: Rng, decide: (state: GameState) => Decision): number {
  const state = newGame()
  while (!state.gameOver) {
    rollDiceMut(state, rng)
    for (;;) {
      if (state.gameOver || !state.hasRolled) break
      const decision = decide(state)
      const mustScore = state.rollsRemaining === 0
      if (mustScore || decision.scoreNow) {
        const legal = openCategories(state)
        let cat = decision.category
        if (!legal.includes(cat)) cat = legal[0]!
        scoreCategoryMut(state, cat)
        break
      }
      setHoldsMut(state, decision.held)
      rollDiceMut(state, rng)
    }
  }
  return totalScore(state)
}
