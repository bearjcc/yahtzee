import {
  LOWER_SECTION,
  UPPER_BONUS_POINTS,
  UPPER_BONUS_THRESHOLD,
  UPPER_SECTION,
  YAHTZEE_BONUS_CHIP,
  lowerTotal,
  upperTotal,
  type Category,
  type GameResult,
} from '../engine/index.ts'
import {
  LOWER_SECTION as GOBLIN_LOWER,
  UPPER_SECTION as GOBLIN_UPPER,
  INSPIRATION_POINTS,
  INSPIRATION_THRESHOLD,
  lowerTotal as goblinLowerTotal,
  upperTotal as goblinUpperTotal,
  type Category as GoblinCategory,
  type GameResult as GoblinGameResult,
} from '../games/goblinGamble/index.ts'
import type { EpisodeResult, PylEpisodeResult } from '../games/types.ts'

const SHEET_GAMES = 6

const UPPER_LABELS: Record<(typeof UPPER_SECTION)[number], string> = {
  aces: 'Aces',
  twos: 'Twos',
  threes: 'Threes',
  fours: 'Fours',
  fives: 'Fives',
  sixes: 'Sixes',
}

const LOWER_LABELS: Record<(typeof LOWER_SECTION)[number], string> = {
  threeOfAKind: '3 of a Kind',
  fourOfAKind: '4 of a Kind',
  fullHouse: 'Full House',
  smallStraight: 'Sm Straight',
  largeStraight: 'Lg Straight',
  yahtzee: 'YAHTZEE',
  chance: 'Chance',
}

export type ScoresheetView = {
  botId: number
  fitness: number
  gamesPlayed: number
  games: GameResult[]
  matched: boolean
}

export type PylSheetView = {
  botId: number
  fitness: number
  gamesPlayed: number
  episodes: PylEpisodeResult[]
  matched: boolean
  title: string
}

export type GoblinSheetView = {
  botId: number
  fitness: number
  gamesPlayed: number
  games: GoblinGameResult[]
  matched: boolean
}

const GOBLIN_UPPER_LABELS: Record<(typeof GOBLIN_UPPER)[number], string> = {
  ones: 'Ones',
  twos: 'Twos',
  threes: 'Threes',
  fours: 'Fours',
  fives: 'Fives',
  sixes: 'Sixes',
  sevens: 'Sevens',
  eights: 'Eights',
  nines: 'Nines',
  tens: 'Tens',
}

const GOBLIN_LOWER_LABELS: Record<(typeof GOBLIN_LOWER)[number], string> = {
  magicMissile: 'Magic Missile',
  partyOfFour: 'Party of Four',
  fireball: 'Fireball',
  balancedParty: 'Balanced Party',
  initiative: 'Initiative',
  dungeonCrawl: 'Dungeon Crawl',
  polymorph: 'Polymorph',
  minMax: 'Min-Max',
  success: 'Success',
  criticalSuccess: 'Critical Success',
  failure: 'Failure',
  criticalFailure: 'Critical Failure',
  twinnedSpell: 'Twinned Spell',
  bagOfHolding: 'Bag of Holding',
}

function cell(text: string, className = ''): HTMLTableCellElement {
  const td = document.createElement('td')
  if (className) td.className = className
  td.textContent = text
  return td
}

function th(text: string, className = '', scope: 'col' | 'row' = 'col'): HTMLTableCellElement {
  const el = document.createElement('th')
  el.scope = scope
  if (className) el.className = className
  el.textContent = text
  return el
}

function scoreCell(v: number | null | undefined): HTMLTableCellElement {
  if (v === null || v === undefined) return cell('', 'score')
  return cell(String(v), 'score')
}

function categoryCells(games: GameResult[], cat: Category): HTMLTableCellElement[] {
  const cells: HTMLTableCellElement[] = []
  for (let i = 0; i < SHEET_GAMES; i++) {
    const g = games[i]
    cells.push(g ? scoreCell(g.scorecard[cat]) : cell('', 'score empty'))
  }
  return cells
}

function totalCells(values: (number | null)[]): HTMLTableCellElement[] {
  const cells: HTMLTableCellElement[] = []
  for (let i = 0; i < SHEET_GAMES; i++) {
    const v = values[i]
    cells.push(v === null || v === undefined ? cell('', 'score empty') : cell(String(v), 'score total'))
  }
  return cells
}

function row(
  label: string,
  scoreCells: HTMLTableCellElement[],
  opts: { section?: string; strong?: boolean } = {},
): HTMLTableRowElement {
  const tr = document.createElement('tr')
  if (opts.section) tr.className = opts.section
  if (opts.strong) tr.classList.add('strong')
  tr.append(th(label, 'cat', 'row'), ...scoreCells)
  return tr
}

function sectionHeader(label: string): HTMLTableRowElement {
  const tr = document.createElement('tr')
  tr.className = 'section-label'
  const h = th(label, 'section', 'row')
  h.colSpan = 1 + SHEET_GAMES
  tr.append(h)
  return tr
}

/** Render a classic-style scoresheet into `host` (replaces children). */
export function renderScoresheet(host: HTMLElement, view: ScoresheetView | null): void {
  host.replaceChildren()
  if (!view) {
    const empty = document.createElement('p')
    empty.className = 'scoresheet-empty'
    empty.textContent = 'No top bot yet. Run evolution to fill the sheet.'
    host.append(empty)
    return
  }

  const { games } = view
  const shown = Math.min(SHEET_GAMES, games.length)

  const wrap = document.createElement('div')
  wrap.className = 'scoresheet'

  const header = document.createElement('div')
  header.className = 'scoresheet-header'
  const title = document.createElement('h2')
  title.textContent = 'Yahtzee'
  const name = document.createElement('div')
  name.className = 'scoresheet-name'
  name.textContent = `Name: Bot #${view.botId}`
  header.append(title, name)
  wrap.append(header)

  const table = document.createElement('table')
  table.className = 'scoresheet-table'

  const thead = document.createElement('thead')
  const headRow = document.createElement('tr')
  headRow.append(
    th(''),
    ...Array.from({ length: SHEET_GAMES }, (_, i) => th(`#${i + 1}`, 'score')),
  )
  thead.append(headRow)
  table.append(thead)

  const tbody = document.createElement('tbody')
  tbody.append(sectionHeader('UPPER SECTION'))

  for (const cat of UPPER_SECTION) {
    tbody.append(row(UPPER_LABELS[cat], categoryCells(games, cat)))
  }

  const upperTotals = games.map((g) => upperTotal(g.scorecard))
  const bonuses = games.map((g) =>
    upperTotal(g.scorecard) >= UPPER_BONUS_THRESHOLD ? UPPER_BONUS_POINTS : 0,
  )
  const upperWithBonus = upperTotals.map((u, i) => u + (bonuses[i] ?? 0))

  tbody.append(
    row('Total Score', totalCells(pad(upperTotals, shown)), { strong: true }),
    row(`Bonus (≥${UPPER_BONUS_THRESHOLD})`, totalCells(pad(bonuses, shown))),
    row('Total of Upper Section', totalCells(pad(upperWithBonus, shown)), {
      strong: true,
      section: 'subtotal',
    }),
  )

  tbody.append(sectionHeader('LOWER SECTION'))

  for (const cat of LOWER_SECTION) {
    tbody.append(row(LOWER_LABELS[cat], categoryCells(games, cat)))
  }

  const yahtzeeBonusPts = games.map((g) => g.yahtzeeBonuses * YAHTZEE_BONUS_CHIP)
  const lowerTotals = games.map((g, i) => lowerTotal(g.scorecard) + (yahtzeeBonusPts[i] ?? 0))

  tbody.append(
    row('YAHTZEE BONUS', totalCells(pad(yahtzeeBonusPts, shown))),
    row('Total of Lower Section', totalCells(pad(lowerTotals, shown)), {
      strong: true,
      section: 'subtotal',
    }),
    row('Total of Upper Section', totalCells(pad(upperWithBonus, shown)), {
      strong: true,
      section: 'subtotal',
    }),
    row('GRAND TOTAL', totalCells(pad(games.map((g) => g.total), shown)), {
      strong: true,
      section: 'grand',
    }),
  )

  table.append(tbody)
  wrap.append(table)

  const foot = document.createElement('p')
  foot.className = 'scoresheet-foot'
  const parts = [
    `Showing ${shown} of ${view.gamesPlayed}`,
    `mean fitness ${view.fitness.toFixed(1)}`,
  ]
  if (!view.matched) parts.push('replay totals mismatch stored scores')
  foot.textContent = parts.join(' · ')
  wrap.append(foot)

  host.append(wrap)
}

/** Render push-your-luck episode summary (turns / banked / fitness). */
export function renderPylSheet(host: HTMLElement, view: PylSheetView | null): void {
  host.replaceChildren()
  if (!view) {
    const empty = document.createElement('p')
    empty.className = 'scoresheet-empty'
    empty.textContent = 'No top bot yet. Run evolution to fill the sheet.'
    host.append(empty)
    return
  }

  const shown = Math.min(SHEET_GAMES, view.episodes.length)
  const wrap = document.createElement('div')
  wrap.className = 'scoresheet'

  const header = document.createElement('div')
  header.className = 'scoresheet-header'
  const title = document.createElement('h2')
  title.textContent = view.title
  const name = document.createElement('div')
  name.className = 'scoresheet-name'
  name.textContent = `Name: Bot #${view.botId}`
  header.append(title, name)
  wrap.append(header)

  const table = document.createElement('table')
  table.className = 'scoresheet-table'
  const thead = document.createElement('thead')
  const headRow = document.createElement('tr')
  headRow.append(
    th(''),
    ...Array.from({ length: SHEET_GAMES }, (_, i) => th(`#${i + 1}`, 'score')),
  )
  thead.append(headRow)
  table.append(thead)

  const tbody = document.createElement('tbody')
  const turns = view.episodes.map((e) => e.turns)
  const banked = view.episodes.map((e) => e.banked)
  const fitness = view.episodes.map((e) => Math.round(e.total * 10) / 10)
  const goal = view.episodes[0]?.goal ?? 0

  tbody.append(
    row('Goal', totalCells(pad(Array(shown).fill(goal), shown))),
    row('Turns', totalCells(pad(turns, shown))),
    row('Banked', totalCells(pad(banked, shown))),
    row('Fitness (goal/turns)', totalCells(pad(fitness, shown)), {
      strong: true,
      section: 'grand',
    }),
  )
  table.append(tbody)
  wrap.append(table)

  const foot = document.createElement('p')
  foot.className = 'scoresheet-foot'
  const parts = [
    `Showing ${shown} of ${view.gamesPlayed}`,
    `mean fitness ${view.fitness.toFixed(1)}`,
  ]
  if (!view.matched) parts.push('replay totals mismatch stored scores')
  foot.textContent = parts.join(' · ')
  wrap.append(foot)
  host.append(wrap)
}

/** Render Goblin Gamble scoresheet into `host` (replaces children). */
export function renderGoblinSheet(host: HTMLElement, view: GoblinSheetView | null): void {
  host.replaceChildren()
  if (!view) {
    const empty = document.createElement('p')
    empty.className = 'scoresheet-empty'
    empty.textContent = 'No top bot yet. Run evolution to fill the sheet.'
    host.append(empty)
    return
  }

  const { games } = view
  const shown = Math.min(SHEET_GAMES, games.length)

  const wrap = document.createElement('div')
  wrap.className = 'scoresheet'

  const header = document.createElement('div')
  header.className = 'scoresheet-header'
  const title = document.createElement('h2')
  title.textContent = 'Goblin Gamble'
  const name = document.createElement('div')
  name.className = 'scoresheet-name'
  name.textContent = `Name: Bot #${view.botId}`
  header.append(title, name)
  wrap.append(header)

  const table = document.createElement('table')
  table.className = 'scoresheet-table'

  const thead = document.createElement('thead')
  const headRow = document.createElement('tr')
  headRow.append(
    th(''),
    ...Array.from({ length: SHEET_GAMES }, (_, i) => th(`#${i + 1}`, 'score')),
  )
  thead.append(headRow)
  table.append(thead)

  const tbody = document.createElement('tbody')
  tbody.append(sectionHeader('UPPER SECTION'))

  for (const cat of GOBLIN_UPPER) {
    tbody.append(row(GOBLIN_UPPER_LABELS[cat], goblinCategoryCells(games, cat)))
  }

  const upperTotals = games.map((g) => goblinUpperTotal(g.scorecard))
  const bonuses = games.map((g) =>
    goblinUpperTotal(g.scorecard) >= INSPIRATION_THRESHOLD ? INSPIRATION_POINTS : 0,
  )
  const upperWithBonus = upperTotals.map((u, i) => u + (bonuses[i] ?? 0))

  tbody.append(
    row('Total Score', totalCells(pad(upperTotals, shown)), { strong: true }),
    row(`Inspiration (≥${INSPIRATION_THRESHOLD})`, totalCells(pad(bonuses, shown))),
    row('Total of Upper Section', totalCells(pad(upperWithBonus, shown)), {
      strong: true,
      section: 'subtotal',
    }),
  )

  tbody.append(sectionHeader('LOWER SECTION'))

  for (const cat of GOBLIN_LOWER) {
    tbody.append(row(GOBLIN_LOWER_LABELS[cat], goblinCategoryCells(games, cat)))
  }

  const lowerTotals = games.map((g) => goblinLowerTotal(g.scorecard))

  tbody.append(
    row('Total of Lower Section', totalCells(pad(lowerTotals, shown)), {
      strong: true,
      section: 'subtotal',
    }),
    row('Total of Upper Section', totalCells(pad(upperWithBonus, shown)), {
      strong: true,
      section: 'subtotal',
    }),
    row('GRAND TOTAL', totalCells(pad(games.map((g) => g.total), shown)), {
      strong: true,
      section: 'grand',
    }),
  )

  table.append(tbody)
  wrap.append(table)

  const foot = document.createElement('p')
  foot.className = 'scoresheet-foot'
  const parts = [
    `Showing ${shown} of ${view.gamesPlayed}`,
    `mean fitness ${view.fitness.toFixed(1)}`,
  ]
  if (!view.matched) parts.push('replay totals mismatch stored scores')
  foot.textContent = parts.join(' · ')
  wrap.append(foot)

  host.append(wrap)
}

function goblinCategoryCells(
  games: GoblinGameResult[],
  cat: GoblinCategory,
): HTMLTableCellElement[] {
  const cells: HTMLTableCellElement[] = []
  for (let i = 0; i < SHEET_GAMES; i++) {
    const g = games[i]
    cells.push(g ? scoreCell(g.scorecard[cat]) : cell('', 'score empty'))
  }
  return cells
}

export function pylEpisodesFrom(results: EpisodeResult[]): PylEpisodeResult[] {
  return results.filter((e): e is PylEpisodeResult => e.kind === 'pyl')
}

function pad(values: number[], shown: number): (number | null)[] {
  const out: (number | null)[] = []
  for (let i = 0; i < SHEET_GAMES; i++) {
    out.push(i < shown ? (values[i] ?? null) : null)
  }
  return out
}

export const SCORESHEET_GAME_COLS = SHEET_GAMES
