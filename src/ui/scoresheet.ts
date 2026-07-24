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

const SHEET_GAMES = 6

const UPPER_LABELS: Record<(typeof UPPER_SECTION)[number], { name: string; how: string }> = {
  aces: { name: 'Aces', how: 'Count and Add Only Aces' },
  twos: { name: 'Twos', how: 'Count and Add Only Twos' },
  threes: { name: 'Threes', how: 'Count and Add Only Threes' },
  fours: { name: 'Fours', how: 'Count and Add Only Fours' },
  fives: { name: 'Fives', how: 'Count and Add Only Fives' },
  sixes: { name: 'Sixes', how: 'Count and Add Only Sixes' },
}

const LOWER_LABELS: Record<(typeof LOWER_SECTION)[number], { name: string; how: string }> = {
  threeOfAKind: { name: '3 of a Kind', how: 'Add Total of All Dice' },
  fourOfAKind: { name: '4 of a Kind', how: 'Add Total of All Dice' },
  fullHouse: { name: 'Full House', how: 'SCORE 25' },
  smallStraight: { name: 'Sm Straight', how: 'SCORE 30' },
  largeStraight: { name: 'Lg Straight', how: 'SCORE 40' },
  yahtzee: { name: 'YAHTZEE', how: 'SCORE 50' },
  chance: { name: 'Chance', how: 'Add Total of All Dice' },
}

export type ScoresheetView = {
  botId: number
  fitness: number
  gamesPlayed: number
  games: GameResult[]
  matched: boolean
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
  how: string,
  scoreCells: HTMLTableCellElement[],
  opts: { section?: string; strong?: boolean } = {},
): HTMLTableRowElement {
  const tr = document.createElement('tr')
  if (opts.section) tr.className = opts.section
  if (opts.strong) tr.classList.add('strong')
  tr.append(th(label, 'cat', 'row'), cell(how, 'how'), ...scoreCells)
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
    th('How to Score', 'how'),
    ...Array.from({ length: SHEET_GAMES }, (_, i) => th(`Game #${i + 1}`, 'score')),
  )
  thead.append(headRow)
  table.append(thead)

  const tbody = document.createElement('tbody')

  const upperHdr = document.createElement('tr')
  upperHdr.className = 'section-label'
  const uh = th('UPPER SECTION', 'section', 'row')
  uh.colSpan = 2 + SHEET_GAMES
  upperHdr.append(uh)
  tbody.append(upperHdr)

  for (const cat of UPPER_SECTION) {
    const meta = UPPER_LABELS[cat]
    tbody.append(row(meta.name, meta.how, categoryCells(games, cat)))
  }

  const upperTotals = games.map((g) => upperTotal(g.scorecard))
  const bonuses = games.map((g) =>
    upperTotal(g.scorecard) >= UPPER_BONUS_THRESHOLD ? UPPER_BONUS_POINTS : 0,
  )
  const upperWithBonus = upperTotals.map((u, i) => u + (bonuses[i] ?? 0))

  tbody.append(
    row('Total Score', '', totalCells(pad(upperTotals, shown)), { strong: true }),
    row(
      `Bonus if total score is ${UPPER_BONUS_THRESHOLD} or over`,
      `Score ${UPPER_BONUS_POINTS}`,
      totalCells(pad(bonuses, shown)),
    ),
    row('Total of Upper Section', '', totalCells(pad(upperWithBonus, shown)), {
      strong: true,
      section: 'subtotal',
    }),
  )

  const lowerHdr = document.createElement('tr')
  lowerHdr.className = 'section-label'
  const lh = th('LOWER SECTION', 'section', 'row')
  lh.colSpan = 2 + SHEET_GAMES
  lowerHdr.append(lh)
  tbody.append(lowerHdr)

  for (const cat of LOWER_SECTION) {
    const meta = LOWER_LABELS[cat]
    tbody.append(row(meta.name, meta.how, categoryCells(games, cat)))
  }

  const yahtzeeBonusPts = games.map((g) => g.yahtzeeBonuses * YAHTZEE_BONUS_CHIP)
  const lowerTotals = games.map((g, i) => lowerTotal(g.scorecard) + (yahtzeeBonusPts[i] ?? 0))

  tbody.append(
    row('YAHTZEE BONUS', `SCORE ${YAHTZEE_BONUS_CHIP} PER BONUS`, totalCells(pad(yahtzeeBonusPts, shown))),
    row('Total of Lower Section', '', totalCells(pad(lowerTotals, shown)), {
      strong: true,
      section: 'subtotal',
    }),
    row('Total of Upper Section', '', totalCells(pad(upperWithBonus, shown)), {
      strong: true,
      section: 'subtotal',
    }),
    row('GRAND TOTAL', '', totalCells(pad(games.map((g) => g.total), shown)), {
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

function pad(values: number[], shown: number): (number | null)[] {
  const out: (number | null)[] = []
  for (let i = 0; i < SHEET_GAMES; i++) {
    out.push(i < shown ? (values[i] ?? null) : null)
  }
  return out
}

export const SCORESHEET_GAME_COLS = SHEET_GAMES
