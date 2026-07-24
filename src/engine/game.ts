import { rollDie, type Rng } from './rng.ts'
import { applyScore, legalCategories, totalScore } from './scoring.ts'
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

export function setHolds(state: GameState, held: boolean[]): GameState {
  if (!state.hasRolled || state.rollsRemaining <= 0) return state
  return { ...state, held: held.slice(0, 5) }
}

export function scoreCategory(state: GameState, category: Category): GameState {
  if (!state.hasRolled || state.gameOver) return state
  return applyScore(state, category)
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
  let state = newGame()
  while (!state.gameOver) {
    state = rollDice(state, rng)
    for (;;) {
      if (state.gameOver || !state.hasRolled) break
      const decision = decide(state)
      const mustScore = state.rollsRemaining === 0
      if (mustScore || decision.scoreNow) {
        const legal = openCategories(state)
        let cat = decision.category
        if (!legal.includes(cat)) cat = legal[0]!
        state = scoreCategory(state, cat)
        break
      }
      state = setHolds(state, decision.held)
      state = rollDice(state, rng)
    }
  }
  return totalScore(state)
}
