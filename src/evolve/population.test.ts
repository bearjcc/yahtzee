import { describe, expect, it } from 'vitest'
import { DEFAULT_PARAMS } from './params.ts'
import { Population } from './population.ts'

describe('Population.makeChildGenome', () => {
  it('produces asexual children with parentB null when pCrossover is 0', () => {
    const pop = new Population({ ...DEFAULT_PARAMS, pCrossover: 0 }, 1)
    for (let i = 0; i < 3; i++) {
      pop.addEvaluated({
        genome: pop.makeSeedGenome(),
        fitness: 100 + i,
        gameScores: [100],
        gameSeeds: [1],
        parentA: null,
        parentB: null,
      })
    }
    const child = pop.makeChildGenome()
    expect(child.parentA).toBeGreaterThan(0)
    expect(child.parentB).toBeNull()
    expect(child.genome.length).toBe(pop.makeSeedGenome().length)
  })

  it('produces crossover children with both parents when pCrossover is 1', () => {
    const pop = new Population({ ...DEFAULT_PARAMS, pCrossover: 1 }, 2)
    for (let i = 0; i < 3; i++) {
      pop.addEvaluated({
        genome: pop.makeSeedGenome(),
        fitness: 100 + i,
        gameScores: [100],
        gameSeeds: [1],
        parentA: null,
        parentB: null,
      })
    }
    const child = pop.makeChildGenome()
    expect(child.parentA).toBeGreaterThan(0)
    expect(child.parentB).toBeGreaterThan(0)
  })
})
