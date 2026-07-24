import { describe, expect, it } from 'vitest'
import { mulberry32 } from '../../engine/rng.ts'
import { IN, INPUT_SIZE, NUM_CATEGORIES } from '../../nn/layout.ts'
import { encodeGoblinInto } from './encode.ts'
import { playGame, playGameResult, rollDice } from './game.ts'
import { CATEGORIES, DIE_SIDES, DICE_COUNT, newGame } from './types.ts'

describe('goblin game loop', () => {
  it('matches shared category head size', () => {
    expect(CATEGORIES.length).toBe(NUM_CATEGORIES)
  })

  it('rolls dice within each die sides', () => {
    const rng = mulberry32(42)
    let state = newGame()
    state = rollDice(state, rng)
    expect(state.dice).toHaveLength(DICE_COUNT)
    for (let i = 0; i < DICE_COUNT; i++) {
      expect(state.dice[i]).toBeGreaterThanOrEqual(1)
      expect(state.dice[i]).toBeLessThanOrEqual(DIE_SIDES[i]!)
    }
    expect(state.rollsRemaining).toBe(2)
    expect(state.hasRolled).toBe(true)
  })

  it('completes 24 turns and fills the scorecard', () => {
    const rng = mulberry32(7)
    let turn = 0
    const result = playGameResult(rng, (state) => {
      turn++
      const open = CATEGORIES.filter((c) => state.scorecard[c] === null)
      return {
        scoreNow: true,
        held: Array(DICE_COUNT).fill(false),
        category: open[0]!,
      }
    })
    expect(CATEGORIES.every((c) => result.scorecard[c] !== null)).toBe(true)
    expect(result.total).toBeGreaterThanOrEqual(0)
    expect(turn).toBe(CATEGORIES.length)
  })

  it('playGame matches playGameResult total', () => {
    const decide = () => ({
      scoreNow: true as const,
      held: Array(DICE_COUNT).fill(false) as boolean[],
      category: CATEGORIES[0]!,
    })
    // Use a decide that always picks first open via playGameResult path comparison
    const mk = () => {
      return (state: ReturnType<typeof newGame>) => {
        const open = CATEGORIES.filter((c) => state.scorecard[c] === null)
        return {
          scoreNow: true,
          held: Array(DICE_COUNT).fill(false),
          category: open[0]!,
        }
      }
    }
    void decide
    const a = playGame(mulberry32(99), mk())
    const b = playGameResult(mulberry32(99), mk()).total
    expect(a).toBe(b)
  })
})

describe('encodeGoblinInto', () => {
  it('writes fixed-length input with goblin one-hot', () => {
    const state = newGame()
    state.dice = DIE_SIDES.slice() as unknown as number[]
    state.hasRolled = true
    const v = new Float32Array(INPUT_SIZE)
    encodeGoblinInto(state, v)
    expect(v.length).toBe(INPUT_SIZE)
    expect(v[IN.gameOneHot + 3]).toBe(1)
    expect(v[0]).toBe(1) // d4 max / 4
    expect(v[11]).toBe(1) // d20 max / 20
  })
})
