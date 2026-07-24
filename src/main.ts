import './style.css'
import {
  autoConfigure,
  DEFAULT_ALGORITHM_ID,
  DEFAULT_SHARED,
  estimateStorageBytes,
  formatBytes,
  getAlgorithm,
  listAlgorithms,
  pickShared,
  replayBotGames,
  SHARED_PARAM_SCHEMA,
  type Algorithm,
  type MachineChoice,
  type ParamField,
  type RunConfig,
} from './evolve/index.ts'
import { Orchestrator } from './evolve/orchestrator.ts'
import { getGame, listGames, normalizeGameIds, type GameId } from './games/index.ts'
import { defaultShape, genomeLength, INPUT_SIZE, OUTPUT_SIZE } from './nn/index.ts'
import { DashboardCharts } from './ui/charts.ts'
import { iconBtn, icons } from './ui/icons.ts'
import {
  pylEpisodesFrom,
  renderGoblinSheet,
  renderPylSheet,
  renderScoresheet,
  SCORESHEET_GAME_COLS,
} from './ui/scoresheet.ts'
import { downloadJson, loadCheckpoint, saveCheckpoint } from './store/idb.ts'

type PaneId = 'fitness' | 'hist' | 'console' | 'table'
type BotRow = {
  id: number
  fitness: number
  gameScores: number[]
  cells: Record<string, string>
}

const FOCUS_CLASSES = [
  'focus-fitness',
  'focus-hist',
  'focus-console',
  'focus-table',
] as const

const CHART_FLUSH_MS = 2000
const CONSOLE_MAX_LINES = 30
const TABLE_TOP_N = 50

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
  children: (Node | string)[] = [],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v
    else node.setAttribute(k, v)
  }
  for (const c of children) node.append(typeof c === 'string' ? document.createTextNode(c) : c)
  return node
}

function numInput(field: ParamField): HTMLLabelElement {
  const input = el('input', {
    id: `param-${field.key}`,
    type: 'number',
    value: String(field.default),
    step: field.step ?? 'any',
    'data-key': field.key,
  })
  if (field.min !== undefined) input.min = String(field.min)
  if (field.max !== undefined) input.max = String(field.max)
  const lab = el('label', field.span2 ? { class: 'span2' } : {}, [field.label, input])
  return lab
}

function makePane(
  id: PaneId,
  title: string,
  body: HTMLElement,
): { pane: HTMLElement; maxBtn: HTMLButtonElement } {
  const maxBtn = el('button', {
    class: 'bevel pane-max',
    type: 'button',
    title: 'Maximize',
    'aria-label': `Maximize ${title}`,
  })
  maxBtn.append(icons.maximize())

  const header = el('div', { class: 'pane-header' }, [
    el('span', {}, [title]),
    maxBtn,
  ])
  const bodyWrap = el('div', { class: 'pane-body' }, [body])
  const pane = el('div', { class: 'pane', 'data-pane': id }, [header, bodyWrap])
  return { pane, maxBtn }
}

function hardwareHints() {
  const nav = navigator as Navigator & { deviceMemory?: number }
  return {
    hardwareConcurrency: navigator.hardwareConcurrency || 4,
    deviceMemory: nav.deviceMemory,
  }
}

const app = document.querySelector<HTMLDivElement>('#app')!
app.innerHTML = ''

const hero = el('header', { class: 'hero' }, [
  el('div', { class: 'hero-copy' }, [
    el('h1', {}, ['DiceLab']),
    el('p', { class: 'tag' }, [
      'Breed tiny nets that play dice games. Pick Yahtzee, Farkle, 6 Cubes, and/or Goblin Gamble, twist the knobs, hit Run.',
    ]),
  ]),
])
app.append(hero)

const aboutAlgoP = el('p', { id: 'aboutAlgo' }, [''])
const about = el('details', { class: 'about' }, [
  el('summary', {}, ['How it works']),
  el('div', { class: 'about-body' }, [
    el('p', {}, [
      'Each bot plays a batch of games for every checked ruleset (Yahtzee / Goblin Gamble sheet score; Farkle/6 Cubes use goal÷turns). Fitness is the mean of those episode scores minus a small stdev penalty. Half the episodes share a batch-wide seed suite (fair compare); the other half are private random seeds (limits overfitting).',
    ]),
    aboutAlgoP,
    el('p', {}, [
      'Everything runs in your browser (web workers). The terminal streams as bots finish; charts and the top-50 table refresh every couple of seconds so eval stays fast. Save a checkpoint to IndexedDB, or export JSON.',
    ]),
    el('p', { class: 'about-note' }, [
      'Not affiliated with Hasbro, General Mills, or any brand. Public-domain game mechanics; original UI.',
    ]),
  ]),
])
app.append(about)

const layout = el('div', { class: 'layout' })
app.append(layout)

const setupPanel = el('section', { class: 'panel setup-panel' })
const mainPanel = el('section', { class: 'panel main-panel' })
const sheetPanel = el('section', { class: 'panel sheet-panel' })
layout.append(setupPanel, mainPanel, sheetPanel)
layout.classList.add('sheet-collapsed')

const setupRail = el('button', {
  class: 'setup-rail',
  type: 'button',
  title: 'Open setup',
  'aria-label': 'Open setup',
})
setupRail.append(icons.setup(), document.createTextNode('Setup'))

const setupInner = el('div', { class: 'setup-panel-inner' })
setupPanel.append(setupRail, setupInner)

setupInner.append(el('h2', {}, ['Setup']))

const algorithms = listAlgorithms()
let currentAlgo: Algorithm = getAlgorithm(DEFAULT_ALGORITHM_ID)
const games = listGames()
const gameChecks = new Map<GameId, HTMLInputElement>()

const algoLabel = el('label', { class: 'span2 setup-select-label' }, ['Algorithm'])
const algoSelect = el('select', { id: 'algorithm', class: 'setup-select' })
for (const a of algorithms) {
  algoSelect.append(el('option', { value: a.id }, [a.label]))
}
algoSelect.value = DEFAULT_ALGORITHM_ID
algoLabel.append(algoSelect)

const gamesLabel = el('label', { class: 'span2 setup-select-label' }, ['Games'])
const gamesBox = el('div', { class: 'game-checks', id: 'gameChecks' })
for (const g of games) {
  const input = el('input', {
    type: 'checkbox',
    value: g.id,
    id: `game-${g.id}`,
  }) as HTMLInputElement
  if (g.id === 'yahtzee') input.checked = true
  gameChecks.set(g.id, input)
  const lab = el('label', { class: 'game-check', for: `game-${g.id}` }, [input, g.label])
  gamesBox.append(lab)
}
gamesLabel.append(gamesBox)

const autoGrid = el('div', { class: 'form-grid auto-grid' })
const targetLabel = el('label', {}, [
  'Target score',
  el('input', {
    id: 'autoTarget',
    type: 'number',
    value: String(DEFAULT_SHARED.endTargetScore),
    step: '1',
    min: '0',
  }),
])
const machineLabel = el('label', {}, ['Machine'])
const machineSelect = el('select', { id: 'autoMachine', class: 'setup-select' })
for (const [value, label] of [
  ['auto', 'Auto-detect'],
  ['phone', 'Phone'],
  ['laptop', 'Laptop'],
  ['desktop', 'Desktop'],
] as const) {
  machineSelect.append(el('option', { value }, [label]))
}
machineLabel.append(machineSelect)
const autoBtn = el('button', { type: 'button', class: 'bevel auto-btn', id: 'autoBtn' }, ['Auto'])
const autoBtnWrap = el('label', { class: 'span2 auto-btn-wrap' }, ['Presets + hardware', autoBtn])
autoGrid.append(targetLabel, machineLabel, autoBtnWrap)

const form = el('div', { class: 'form-grid', id: 'paramForm' })
const fieldInputs = new Map<string, HTMLInputElement>()

setupInner.append(algoLabel, gamesLabel, autoGrid, form)

const spaceHint = el('p', { class: 'hint', id: 'spaceHint' }, [''])
setupInner.append(spaceHint)

const setupBtnRow = el('div', { class: 'btn-row' })
const saveBtn = iconBtn('', 'save', 'Save')
const loadBtn = iconBtn('', 'load', 'Load')
const exportBtn = iconBtn('', 'export', 'Export JSON')
setupBtnRow.append(saveBtn, loadBtn, exportBtn)
setupInner.append(setupBtnRow)

const toolbar = el('div', { class: 'toolbar' })
const setupToggleBtn = iconBtn('', 'setup', 'Setup', { title: 'Toggle setup panel' })
const runBtn = iconBtn('', 'play', 'Run', { primary: true })
const pauseBtn = iconBtn('', 'pause', 'Pause')
const resetBtn = iconBtn('', 'reset', 'Reset')
const sheetBtn = iconBtn('', 'sheet', 'Sheet', { title: 'Toggle scoresheet panel' })
toolbar.append(setupToggleBtn, runBtn, pauseBtn, resetBtn, sheetBtn)
mainPanel.append(toolbar)

const sheetRail = el('button', {
  class: 'sheet-rail',
  type: 'button',
  title: 'Open scoresheet',
  'aria-label': 'Open scoresheet',
})
sheetRail.append(icons.sheet(), document.createTextNode('Sheet'))

const sheetInner = el('div', { class: 'sheet-panel-inner' })
sheetPanel.append(sheetInner, sheetRail)
sheetInner.append(el('h2', {}, ['Scoresheet']))

const scoresheetHost = el('div', { class: 'scoresheet-host' })
renderScoresheet(scoresheetHost, null)
sheetInner.append(scoresheetHost)

const statsBar = el('div', { class: 'stats-bar' }, [
  el('span', {}, ['Created: ', el('b', { id: 'statCreated' }, ['0'])]),
  el('span', {}, ['Pop: ', el('b', { id: 'statPop' }, ['0'])]),
  el('span', {}, ['Best: ', el('b', { id: 'statBest' }, ['-'])]),
  el('span', {}, ['Status: ', el('b', { id: 'statStatus' }, ['idle'])]),
])
mainPanel.append(statsBar)

const workspace = el('div', { class: 'workspace' })
mainPanel.append(workspace)

const lineBox = el('div', { class: 'chart-box' })
const histBox = el('div', { class: 'chart-box' })
const lineCanvas = el('canvas')
const histCanvas = el('canvas')
lineBox.append(lineCanvas)
histBox.append(histCanvas)

const consoleEl = el('div', { class: 'console', id: 'console' }, ['Ready.\n'])

const tableWrap = el('div', { class: 'table-wrap' })
const table = el('table', { class: 'bots' })
const theadRow = el('tr')
const thead = el('thead', {}, [theadRow])
const tbody = el('tbody')
table.append(thead, tbody)
tableWrap.append(table)

let tableColumns: { key: string; label: string }[] = []
let sortHeaders = new Map<string, HTMLTableCellElement>()
let tableRows: BotRow[] = []
let sortKey = 'fitness'
let sortDir: 1 | -1 = -1
let consoleLines: string[] = ['Ready.']
const pendingBots: BotRow[] = []
const pendingLogs: string[] = []
let pendingStats: { created: number; best: number; bestId: number; popSize: number } | null = null
let flushTimer: ReturnType<typeof setInterval> | null = null
let consoleRaf: number | null = null

const fitnessPane = makePane('fitness', 'Fitness', lineBox)
const histPane = makePane('hist', 'Score buckets', histBox)
const consolePane = makePane('console', 'Terminal', consoleEl)
const tablePane = makePane('table', 'Top 50', tableWrap)
workspace.append(
  fitnessPane.pane,
  histPane.pane,
  consolePane.pane,
  tablePane.pane,
)

const paneMaxBtns: Record<PaneId, HTMLButtonElement> = {
  fitness: fitnessPane.maxBtn,
  hist: histPane.maxBtn,
  console: consolePane.maxBtn,
  table: tablePane.maxBtn,
}

let sheetBestId = 0

const charts = new DashboardCharts(lineCanvas, histCanvas)
let orch = new Orchestrator({
  algorithmId: DEFAULT_ALGORITHM_ID,
  gameIds: ['yahtzee'],
  shared: { ...DEFAULT_SHARED },
  algoParams: currentAlgo.defaultParams(),
})
let unsub: (() => void) | null = null
let focusedPane: PaneId | null = null

function scheduleChartResize(): void {
  requestAnimationFrame(() => {
    charts.resize()
    requestAnimationFrame(() => charts.resize())
  })
}

function setSetupCollapsed(collapsed: boolean): void {
  layout.classList.toggle('setup-collapsed', collapsed)
  setupToggleBtn.setAttribute('aria-pressed', collapsed ? 'false' : 'true')
  scheduleChartResize()
}

function toggleSetup(): void {
  setSetupCollapsed(!layout.classList.contains('setup-collapsed'))
}

function isSheetCollapsed(): boolean {
  return layout.classList.contains('sheet-collapsed')
}

function setSheetCollapsed(collapsed: boolean): void {
  layout.classList.toggle('sheet-collapsed', collapsed)
  sheetBtn.setAttribute('aria-pressed', collapsed ? 'false' : 'true')
  scheduleChartResize()
  if (!collapsed) refreshScoresheet(true)
}

function toggleSheet(): void {
  setSheetCollapsed(!isSheetCollapsed())
}

function setFocusedPane(id: PaneId | null): void {
  focusedPane = id
  for (const cls of FOCUS_CLASSES) workspace.classList.remove(cls)
  if (id) workspace.classList.add(`focus-${id}`)

  for (const [paneId, btn] of Object.entries(paneMaxBtns) as [PaneId, HTMLButtonElement][]) {
    const focused = paneId === id
    const label = focused ? 'Restore' : 'Maximize'
    btn.replaceChildren(icons[focused ? 'restore' : 'maximize']())
    btn.title = label
    btn.setAttribute('aria-label', `${label} ${paneId}`)
  }
  scheduleChartResize()
}

function togglePaneFocus(id: PaneId): void {
  setFocusedPane(focusedPane === id ? null : id)
}

for (const [id, btn] of Object.entries(paneMaxBtns) as [PaneId, HTMLButtonElement][]) {
  btn.addEventListener('click', () => togglePaneFocus(id))
}

setupToggleBtn.addEventListener('click', toggleSetup)
setupRail.addEventListener('click', () => setSetupCollapsed(false))
sheetBtn.addEventListener('click', toggleSheet)
sheetRail.addEventListener('click', () => setSheetCollapsed(false))

new ResizeObserver(() => charts.resize()).observe(workspace)

function rebuildTableHeader(): void {
  tableColumns = [
    { key: 'id', label: 'Bot' },
    { key: 'fitness', label: 'Score' },
    ...currentAlgo.tableColumns,
    { key: 'games', label: 'Games' },
  ]
  sortHeaders = new Map()
  theadRow.replaceChildren()
  for (const col of tableColumns) {
    const th = el('th', { scope: 'col' })
    const btn = el('button', { type: 'button' }, [col.label])
    btn.addEventListener('click', () => setSort(col.key))
    th.append(btn)
    theadRow.append(th)
    sortHeaders.set(col.key, th)
  }
  if (!tableColumns.some((c) => c.key === sortKey)) {
    sortKey = 'fitness'
    sortDir = -1
  }
  renderTable()
}

function rebuildParamForm(algo: Algorithm, values?: Record<string, number>): void {
  currentAlgo = algo
  aboutAlgoP.textContent = algo.blurb
  fieldInputs.clear()
  form.replaceChildren()

  const schemas: ParamField[] = [...algo.paramSchema, ...SHARED_PARAM_SCHEMA]
  for (const field of schemas) {
    const lab = numInput({
      ...field,
      default: values?.[field.key] ?? field.default,
    })
    const input = lab.querySelector('input') as HTMLInputElement
    fieldInputs.set(field.key, input)
    input.addEventListener('input', updateSpaceHint)
    form.append(lab)
  }
  rebuildTableHeader()
  updateSpaceHint()
}

function readNumber(key: string, fallback: number): number {
  const input = fieldInputs.get(key)
  if (!input) return fallback
  const n = Number(input.value)
  return Number.isFinite(n) ? n : fallback
}

function clampField(field: ParamField, raw: number): number {
  let n = raw
  if (field.integer) n = Math.floor(n)
  if (field.min !== undefined) n = Math.max(field.min, n)
  if (field.max !== undefined) n = Math.min(field.max, n)
  return n
}

function readSelectedGameIds(): GameId[] {
  const ids: GameId[] = []
  for (const [id, input] of gameChecks) {
    if (input.checked) ids.push(id)
  }
  return normalizeGameIds(ids)
}

function setSelectedGameIds(ids: GameId[]): void {
  const set = new Set(normalizeGameIds(ids))
  for (const [id, input] of gameChecks) {
    input.checked = set.has(id)
  }
  if (![...gameChecks.values()].some((c) => c.checked)) {
    gameChecks.get('yahtzee')!.checked = true
  }
}

function readRunConfig(): RunConfig {
  const sharedRaw: Record<string, number> = { ...DEFAULT_SHARED }
  for (const field of SHARED_PARAM_SCHEMA) {
    sharedRaw[field.key] = clampField(field, readNumber(field.key, field.default))
  }
  const algoParams: Record<string, number> = {}
  for (const field of currentAlgo.paramSchema) {
    algoParams[field.key] = clampField(field, readNumber(field.key, field.default))
  }
  return {
    algorithmId: algoSelect.value || currentAlgo.id,
    gameIds: readSelectedGameIds(),
    shared: pickShared(sharedRaw),
    algoParams,
  }
}

function writeRunConfig(config: RunConfig): void {
  const algo = getAlgorithm(config.algorithmId)
  algoSelect.value = algo.id
  setSelectedGameIds(config.gameIds)
  const values = { ...config.shared, ...config.algoParams }
  rebuildParamForm(algo, values)
}

function updateSpaceHint(): void {
  const cfg = readRunConfig()
  const shape = defaultShape(INPUT_SIZE, OUTPUT_SIZE, cfg.shared.hidden1, cfg.shared.hidden2)
  const glen = genomeLength(shape)
  const bytes = estimateStorageBytes(glen, cfg.shared.maxBots)
  spaceHint.textContent = `~${formatBytes(glen * 4)} per bot (${glen} weights). Cap ${cfg.shared.maxBots} bots: ~${formatBytes(bytes)}. Prune kicks in above the cap.`
}

algoSelect.addEventListener('change', () => {
  const algo = getAlgorithm(algoSelect.value)
  const prev = readRunConfig()
  rebuildParamForm(algo, { ...prev.shared, ...algo.defaultParams() })
})

autoBtn.addEventListener('click', () => {
  const target = Math.max(0, Number((targetLabel.querySelector('input') as HTMLInputElement).value) || 0)
  const machine = machineSelect.value as MachineChoice
  const result = autoConfigure(target, machine, hardwareHints())
  writeRunConfig(result)
  appendLog(
    `Auto: ${result.machine}/${result.targetBand} → ${getAlgorithm(result.algorithmId).label} (target ${result.targetScore})`,
  )
})

rebuildParamForm(currentAlgo)

function pushConsoleLine(line: string): void {
  consoleLines.push(line)
  while (consoleLines.length > CONSOLE_MAX_LINES) consoleLines.shift()
}

function renderConsole(): void {
  consoleEl.textContent = consoleLines.join('\n') + '\n'
  consoleEl.scrollTop = consoleEl.scrollHeight
}

function appendLog(line: string): void {
  pushConsoleLine(line)
  renderConsole()
}

function mergeTopBots(current: BotRow[], incoming: BotRow[], cap: number): BotRow[] {
  const byId = new Map<number, BotRow>()
  for (const b of current) byId.set(b.id, b)
  for (const b of incoming) byId.set(b.id, b)
  return [...byId.values()]
    .sort((a, b) => b.fitness - a.fitness || b.id - a.id)
    .slice(0, cap)
}

function sortValue(bot: BotRow, key: string): number {
  if (key === 'id') return bot.id
  if (key === 'fitness') return bot.fitness
  if (key === 'games') {
    if (bot.gameScores.length === 0) return -1
    let sum = 0
    for (const s of bot.gameScores) sum += s
    return sum / bot.gameScores.length
  }
  const raw = bot.cells[key]
  if (raw === undefined || raw === '-') return -1
  const n = Number(raw)
  return Number.isFinite(n) ? n : -1
}

function updateSortHeaders(): void {
  for (const [key, th] of sortHeaders) {
    if (key === sortKey) {
      th.setAttribute('aria-sort', sortDir < 0 ? 'descending' : 'ascending')
    } else {
      th.removeAttribute('aria-sort')
    }
  }
}

function renderTable(): void {
  const sorted = tableRows.slice().sort((a, b) => {
    const d = (sortValue(a, sortKey) - sortValue(b, sortKey)) * sortDir
    return d !== 0 ? d : b.id - a.id
  })
  tbody.replaceChildren(
    ...sorted.map((bot) => {
      const cells: HTMLElement[] = [
        el('td', {}, [String(bot.id)]),
        el('td', {}, [bot.fitness.toFixed(1)]),
      ]
      for (const col of currentAlgo.tableColumns) {
        cells.push(el('td', {}, [bot.cells[col.key] ?? '-']))
      }
      cells.push(el('td', {}, [bot.gameScores.map((x) => x.toFixed(0)).join(', ')]))
      return el('tr', {}, cells)
    }),
  )
  updateSortHeaders()
}

function clearTableRows(): void {
  tableRows = []
  renderTable()
}

function clearUiBuffer(): void {
  pendingBots.length = 0
  pendingLogs.length = 0
  pendingStats = null
}

function botToRow(bot: {
  id: number
  fitness: number
  gameScores: number[]
  parentA: number | null
  parentB: number | null
  meta?: Record<string, string | number | null>
}): BotRow {
  const cells: Record<string, string> = {}
  for (const col of currentAlgo.tableColumns) {
    cells[col.key] = currentAlgo.cellValue(
      {
        id: bot.id,
        fitness: bot.fitness,
        gameScores: bot.gameScores,
        parentA: bot.parentA,
        parentB: bot.parentB,
        genome: new Float32Array(0),
        meta: bot.meta ?? {},
      },
      col.key,
    )
  }
  return {
    id: bot.id,
    fitness: bot.fitness,
    gameScores: bot.gameScores,
    cells,
  }
}

function refreshScoresheet(force = false): void {
  const bestId = orch.archive.bestId
  if (bestId === 0) {
    if (sheetBestId !== 0 || force) {
      sheetBestId = 0
      renderScoresheet(scoresheetHost, null)
    }
    return
  }
  if (!force && isSheetCollapsed()) return
  if (!force && bestId === sheetBestId) return

  const bot = orch.archive.getBot(bestId)
  if (!bot) {
    renderScoresheet(scoresheetHost, null)
    sheetBestId = 0
    return
  }

  const gameIds = orch.gameIds
  const replay = replayBotGames(bot, orch.archive.shape, SCORESHEET_GAME_COLS, gameIds)
  if (!replay.matched) {
    appendLog(`Scoresheet replay mismatch for bot #${bestId} (seed/checkpoint drift?)`)
  }
  if (gameIds.includes('yahtzee') && replay.games.length > 0) {
    renderScoresheet(scoresheetHost, {
      botId: bot.id,
      fitness: bot.fitness,
      gamesPlayed: bot.gameScores.length,
      games: replay.games,
      matched: replay.matched,
    })
  } else if (gameIds.includes('goblinGamble') && replay.goblinGames.length > 0) {
    renderGoblinSheet(scoresheetHost, {
      botId: bot.id,
      fitness: bot.fitness,
      gamesPlayed: bot.gameScores.length,
      games: replay.goblinGames,
      matched: replay.matched,
    })
  } else {
    const pyl = pylEpisodesFrom(replay.episodes)
    const title = gameIds.map((id) => getGame(id).label).join(' + ')
    renderPylSheet(scoresheetHost, {
      botId: bot.id,
      fitness: bot.fitness,
      gamesPlayed: bot.gameScores.length,
      episodes: pyl,
      matched: replay.matched,
      title,
    })
  }
  sheetBestId = bestId
}

function applyStats(s: { created: number; best: number; bestId: number; popSize: number }): void {
  ;(document.getElementById('statCreated') as HTMLElement).textContent = String(s.created)
  ;(document.getElementById('statPop') as HTMLElement).textContent = String(s.popSize)
  ;(document.getElementById('statBest') as HTMLElement).textContent =
    `${s.best.toFixed(1)} (#${s.bestId})`
  if (!isSheetCollapsed() && s.bestId !== sheetBestId) refreshScoresheet(true)
}

function flushConsole(): void {
  if (pendingLogs.length === 0) return
  for (const line of pendingLogs) pushConsoleLine(line)
  pendingLogs.length = 0
  renderConsole()
}

function scheduleConsoleFlush(): void {
  if (consoleRaf !== null) return
  consoleRaf = requestAnimationFrame(() => {
    consoleRaf = null
    flushConsole()
  })
}

function flushCharts(): void {
  if (pendingBots.length > 0) {
    charts.addBatch(pendingBots.map((b) => ({ id: b.id, fitness: b.fitness })))
    tableRows = mergeTopBots(tableRows, pendingBots, TABLE_TOP_N)
    pendingBots.length = 0
    renderTable()
  }
  if (pendingStats) {
    applyStats(pendingStats)
    pendingStats = null
  } else if (!isSheetCollapsed() && orch.archive.bestId !== sheetBestId) {
    refreshScoresheet(true)
  }
}

function startFlushTimer(): void {
  if (flushTimer !== null) return
  flushTimer = setInterval(flushCharts, CHART_FLUSH_MS)
}

function stopFlushTimer(): void {
  if (flushTimer !== null) {
    clearInterval(flushTimer)
    flushTimer = null
  }
  if (consoleRaf !== null) {
    cancelAnimationFrame(consoleRaf)
    consoleRaf = null
  }
}

function setSort(key: string): void {
  if (sortKey === key) sortDir = sortDir < 0 ? 1 : -1
  else {
    sortKey = key
    sortDir = -1
  }
  renderTable()
}

function wireOrch(): void {
  unsub?.()
  unsub = orch.on((e) => {
    if (e.type === 'log') {
      pendingLogs.push(e.line)
      while (pendingLogs.length > CONSOLE_MAX_LINES) pendingLogs.shift()
      scheduleConsoleFlush()
    }
    if (e.type === 'bot') {
      pendingBots.push(botToRow(e.bot))
    }
    if (e.type === 'stats') {
      pendingStats = {
        created: e.created,
        best: e.best,
        bestId: e.bestId,
        popSize: e.popSize,
      }
    }
    if (e.type === 'status') {
      ;(document.getElementById('statStatus') as HTMLElement).textContent = e.running
        ? 'running'
        : e.reason ?? 'idle'
      runBtn.disabled = e.running
      pauseBtn.disabled = !e.running
      setFormDisabled(e.running)
      if (e.running) {
        startFlushTimer()
      } else {
        flushConsole()
        flushCharts()
        stopFlushTimer()
      }
    }
  })
}

function setFormDisabled(disabled: boolean): void {
  algoSelect.disabled = disabled
  machineSelect.disabled = disabled
  autoBtn.disabled = disabled
  ;(targetLabel.querySelector('input') as HTMLInputElement).disabled = disabled
  for (const input of fieldInputs.values()) input.disabled = disabled
  for (const input of gameChecks.values()) input.disabled = disabled
}

wireOrch()

runBtn.addEventListener('click', () => {
  const cfg = readRunConfig()
  if (orch.archive.bots.length === 0) {
    orch.configure(cfg)
    currentAlgo = orch.algorithm
    rebuildTableHeader()
    charts.reset()
    clearTableRows()
    clearUiBuffer()
    consoleLines = []
    renderConsole()
  }
  setSetupCollapsed(true)
  void orch.start()
})

pauseBtn.addEventListener('click', () => orch.pause())

resetBtn.addEventListener('click', () => {
  orch.pause()
  stopFlushTimer()
  clearUiBuffer()
  const cfg = readRunConfig()
  orch = new Orchestrator(cfg)
  currentAlgo = orch.algorithm
  rebuildTableHeader()
  wireOrch()
  charts.reset()
  clearTableRows()
  consoleLines = ['Reset.']
  renderConsole()
  ;(document.getElementById('statCreated') as HTMLElement).textContent = '0'
  ;(document.getElementById('statPop') as HTMLElement).textContent = '0'
  ;(document.getElementById('statBest') as HTMLElement).textContent = '-'
  ;(document.getElementById('statStatus') as HTMLElement).textContent = 'idle'
  runBtn.disabled = false
  pauseBtn.disabled = true
  setFormDisabled(false)
  sheetBestId = -1
  refreshScoresheet(true)
})

saveBtn.addEventListener('click', () => {
  void saveCheckpoint(orch.serialize()).then(() => appendLog('Saved checkpoint to IndexedDB.'))
})

loadBtn.addEventListener('click', () => {
  void loadCheckpoint<Record<string, unknown>>().then((data) => {
    if (!data) {
      appendLog('No checkpoint found.')
      return
    }
    orch.pause()
    stopFlushTimer()
    clearUiBuffer()
    orch = new Orchestrator()
    try {
      orch.loadSerialized(data)
    } catch (err) {
      appendLog(`Load failed: ${err instanceof Error ? err.message : String(err)}`)
      return
    }
    writeRunConfig({
      algorithmId: orch.algorithm.id,
      gameIds: orch.gameIds,
      shared: orch.shared,
      algoParams: orch.algoParams,
    })
    currentAlgo = orch.algorithm
    rebuildTableHeader()
    wireOrch()
    charts.reset()
    const loaded = orch.archive.bots.map((b) => botToRow(b))
    if (loaded.length > 0) {
      charts.addBatch(loaded.map((b) => ({ id: b.id, fitness: b.fitness })))
    }
    tableRows = mergeTopBots([], loaded, TABLE_TOP_N)
    renderTable()
    appendLog(
      `Loaded ${orch.archive.bots.length} bots (${orch.algorithm.label}; ${orch.gameIds.join('+')}).`,
    )
    applyStats({
      created: orch.archive.nextId - 1,
      best: orch.archive.bestFitness,
      bestId: orch.archive.bestId,
      popSize: orch.archive.bots.length,
    })
    sheetBestId = -1
    refreshScoresheet(true)
  })
})

exportBtn.addEventListener('click', () => {
  downloadJson(`dicelab-bots-${Date.now()}.json`, orch.serialize())
  appendLog('Exported JSON download.')
})

pauseBtn.disabled = true
setupToggleBtn.setAttribute('aria-pressed', 'true')
sheetBtn.setAttribute('aria-pressed', 'false')
scheduleChartResize()
