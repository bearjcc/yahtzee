import { mulberry32 } from '../engine/rng.ts'
import {
  defaultShape,
  genomeLength,
  randomGenome,
  INPUT_SIZE,
  OUTPUT_SIZE,
  type NetShape,
} from '../nn/index.ts'
import { crossoverAndMutate, mutateCopy } from './crossover.ts'
import { Lottery, ticketsForScore } from './lottery.ts'
import { DEFAULT_PARAMS, type EvolveParams } from './params.ts'

export interface BotRecord {
  id: number
  fitness: number
  gameScores: number[]
  /** Per-game RNG seeds used for fitness; may be absent on legacy checkpoints. */
  gameSeeds?: number[]
  parentA: number | null
  parentB: number | null
  genome: Float32Array
  tickets: number
}

export class Population {
  bots: BotRecord[] = []
  /** id -> index in bots (after prune may rebuild). */
  private byId = new Map<number, BotRecord>()
  lottery: Lottery
  nextId = 1
  shape: NetShape
  params: EvolveParams
  bestFitness = -Infinity
  bestId = 0
  botsSinceBestImprove = 0
  rng: () => number

  constructor(params: EvolveParams, seed = 42) {
    this.params = params
    this.shape = defaultShape(INPUT_SIZE, OUTPUT_SIZE, params.hidden1, params.hidden2)
    this.lottery = new Lottery(params.k)
    this.rng = mulberry32(seed)
  }

  get genomeBytes(): number {
    return genomeLength(this.shape) * 4
  }

  reset(params: EvolveParams, seed = 42): void {
    this.params = params
    this.shape = defaultShape(INPUT_SIZE, OUTPUT_SIZE, params.hidden1, params.hidden2)
    this.bots = []
    this.byId.clear()
    this.lottery = new Lottery(params.k)
    this.nextId = 1
    this.bestFitness = -Infinity
    this.bestId = 0
    this.botsSinceBestImprove = 0
    this.rng = mulberry32(seed)
  }

  getBot(id: number): BotRecord | undefined {
    return this.byId.get(id)
  }

  makeSeedGenome(): Float32Array {
    return randomGenome(this.shape, this.rng)
  }

  makeChildGenome(): {
    genome: Float32Array
    parentA: number
    parentB: number | null
  } {
    if (this.rng() < this.params.pCrossover) {
      const parentA = this.lottery.draw(this.rng)
      const parentB = this.lottery.draw(this.rng)
      const a = this.byId.get(parentA)!.genome
      const b = this.byId.get(parentB)!.genome
      const genome = crossoverAndMutate(
        a,
        b,
        this.rng,
        this.params.pMut,
        this.params.mutSigma,
      )
      return { genome, parentA, parentB }
    }
    const parentA = this.lottery.draw(this.rng)
    const genome = mutateCopy(
      this.byId.get(parentA)!.genome,
      this.rng,
      this.params.pMut,
      this.params.mutSigma,
    )
    return { genome, parentA, parentB: null }
  }

  addEvaluated(opts: {
    genome: Float32Array
    fitness: number
    gameScores: number[]
    gameSeeds: number[]
    parentA: number | null
    parentB: number | null
  }): BotRecord {
    const id = this.nextId++
    const tickets = ticketsForScore(opts.fitness, this.params.k)
    const bot: BotRecord = {
      id,
      fitness: opts.fitness,
      gameScores: opts.gameScores,
      gameSeeds: opts.gameSeeds,
      parentA: opts.parentA,
      parentB: opts.parentB,
      genome: opts.genome,
      tickets,
    }
    this.bots.push(bot)
    this.byId.set(id, bot)
    this.lottery.add(id, opts.fitness)

    if (opts.fitness > this.bestFitness) {
      this.bestFitness = opts.fitness
      this.bestId = id
      this.botsSinceBestImprove = 0
    } else {
      this.botsSinceBestImprove++
    }

    this.pruneIfNeeded()
    return bot
  }

  pruneIfNeeded(): void {
    const max = this.params.maxBots
    while (this.bots.length > max) {
      let worstIdx = 0
      let worstFit = this.bots[0]!.fitness
      let worstId = this.bots[0]!.id
      for (let i = 1; i < this.bots.length; i++) {
        const b = this.bots[i]!
        if (b.fitness < worstFit || (b.fitness === worstFit && b.id < worstId)) {
          worstIdx = i
          worstFit = b.fitness
          worstId = b.id
        }
      }
      const worst = this.bots[worstIdx]!
      const last = this.bots.length - 1
      this.bots[worstIdx] = this.bots[last]!
      this.bots.pop()
      this.byId.delete(worst.id)
      this.lottery.removeId(worst.id)
    }
  }

  shouldStop(): string | null {
    const p = this.params
    const created = this.nextId - 1
    if (p.endMaxBots > 0 && created >= p.endMaxBots) return `Reached endMaxBots (${p.endMaxBots})`
    if (p.endTargetScore > 0 && this.bestFitness >= p.endTargetScore) {
      return `Reached target score ${p.endTargetScore}`
    }
    if (p.endStagnation > 0 && created >= p.seedCount && this.botsSinceBestImprove >= p.endStagnation) {
      return `Stagnation (${p.endStagnation} bots without improvement)`
    }
    return null
  }

  serializeMeta(): object {
    return {
      params: this.params,
      nextId: this.nextId,
      bestFitness: this.bestFitness,
      bestId: this.bestId,
      botsSinceBestImprove: this.botsSinceBestImprove,
      bots: this.bots.map((b) => ({
        id: b.id,
        fitness: b.fitness,
        gameScores: b.gameScores,
        gameSeeds: b.gameSeeds,
        parentA: b.parentA,
        parentB: b.parentB,
        tickets: b.tickets,
        genome: Array.from(b.genome),
      })),
    }
  }

  loadSerialized(data: {
    params: EvolveParams
    nextId: number
    bestFitness: number
    bestId: number
    botsSinceBestImprove: number
    bots: Array<{
      id: number
      fitness: number
      gameScores: number[]
      gameSeeds?: number[]
      parentA: number | null
      parentB: number | null
      tickets: number
      genome: number[]
    }>
  }): void {
    this.reset({ ...DEFAULT_PARAMS, ...data.params })
    this.nextId = data.nextId
    this.bestFitness = data.bestFitness
    this.bestId = data.bestId
    this.botsSinceBestImprove = data.botsSinceBestImprove
    this.bots = []
    this.byId.clear()
    this.lottery.clear()
    for (const b of data.bots) {
      const bot: BotRecord = {
        ...b,
        genome: Float32Array.from(b.genome),
      }
      this.bots.push(bot)
      this.byId.set(bot.id, bot)
      this.lottery.add(bot.id, bot.fitness)
    }
  }
}
