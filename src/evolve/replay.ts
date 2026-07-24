import { mulberry32, playGameResult, type GameResult } from '../engine/index.ts'
import { decide, type NetShape } from '../nn/index.ts'
import type { BotRecord } from './population.ts'

/** Match orchestrator seed/child baseSeed assignment. */
export function evalBaseSeed(bot: Pick<BotRecord, 'id' | 'parentA'>): number {
  if (bot.parentA === null) return (((bot.id - 1) * 7919 + 1) >>> 0)
  return (bot.id * 104729) >>> 0
}

export type ReplayResult = {
  games: GameResult[]
  /** True when every replayed total matches bot.gameScores for those games. */
  matched: boolean
}

/**
 * Replay the first `gameCount` fitness games for a bot (default: all stored scores).
 */
export function replayBotGames(
  bot: BotRecord,
  shape: NetShape,
  gameCount?: number,
): ReplayResult {
  const n = Math.min(gameCount ?? bot.gameScores.length, bot.gameScores.length)
  const baseSeed = evalBaseSeed(bot)
  const games: GameResult[] = []
  let matched = true
  for (let g = 0; g < n; g++) {
    const rng = mulberry32((baseSeed + g * 10007) >>> 0)
    const result = playGameResult(rng, (state) => decide(state, bot.genome, shape))
    games.push(result)
    if (result.total !== bot.gameScores[g]) matched = false
  }
  return { games, matched }
}
