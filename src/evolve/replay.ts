import { actFromEncode, type NetShape } from '../nn/index.ts'
import { getGame } from '../games/registry.ts'
import {
  normalizeGameIds,
  type EpisodeResult,
  type GameId,
  type YahtzeeEpisodeResult,
} from '../games/types.ts'
import type { BotRecord } from './archive.ts'
import type { GameResult } from '../games/yahtzee/game.ts'
import { mulberry32 } from '../engine/rng.ts'

/** Legacy fallback when bot.gameSeeds is missing (pre-mixed-seed checkpoints). */
export function evalBaseSeed(bot: Pick<BotRecord, 'id' | 'parentA'>): number {
  if (bot.parentA === null) return (((bot.id - 1) * 7919 + 1) >>> 0)
  return (bot.id * 104729) >>> 0
}

/** Resolve per-game seeds for replay (stored preferred, else legacy formula). */
export function resolveGameSeeds(
  bot: Pick<BotRecord, 'id' | 'parentA' | 'gameScores' | 'gameSeeds'>,
  gameCount: number,
): number[] {
  if (bot.gameSeeds && bot.gameSeeds.length >= gameCount) {
    return bot.gameSeeds.slice(0, gameCount)
  }
  const baseSeed = evalBaseSeed(bot)
  const seeds = new Array<number>(gameCount)
  for (let g = 0; g < gameCount; g++) {
    seeds[g] = (baseSeed + g * 10007) >>> 0
  }
  return seeds
}

export type ReplayResult = {
  games: GameResult[]
  episodes: EpisodeResult[]
  /** True when every replayed total matches bot.gameScores for those games. */
  matched: boolean
}

/**
 * Replay fitness episodes for a bot.
 * When `gameIds` includes Yahtzee, `games` holds Yahtzee GameResult rows for the scoresheet.
 */
export function replayBotGames(
  bot: BotRecord,
  shape: NetShape,
  gameCount?: number,
  gameIds: GameId[] = ['yahtzee'],
): ReplayResult {
  const ids = normalizeGameIds(gameIds)
  const perGame = Math.min(
    gameCount ?? Math.floor(bot.gameScores.length / ids.length),
    Math.floor(bot.gameScores.length / ids.length),
  )
  const totalEpisodes = perGame * ids.length
  const gameSeeds = resolveGameSeeds(bot, totalEpisodes)
  const episodes: EpisodeResult[] = []
  const yahtzeeGames: GameResult[] = []
  let matched = true
  let seedIdx = 0
  let scoreIdx = 0

  for (const id of ids) {
    const game = getGame(id)
    for (let g = 0; g < perGame; g++) {
      const rng = mulberry32(gameSeeds[seedIdx++]!)
      const result = game.playResult(rng, (encodeInto) =>
        actFromEncode(encodeInto, bot.genome, shape),
      )
      episodes.push(result)
      if (result.total !== bot.gameScores[scoreIdx]) matched = false
      scoreIdx++
      if (result.kind === 'yahtzee') {
        const y = result as YahtzeeEpisodeResult
        yahtzeeGames.push({
          total: y.total,
          scorecard: y.scorecard as GameResult['scorecard'],
          yahtzeeBonuses: y.yahtzeeBonuses,
        })
      }
    }
  }
  return { games: yahtzeeGames, episodes, matched }
}
