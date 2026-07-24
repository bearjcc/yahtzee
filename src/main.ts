import './style.css'
import {
  DEFAULT_PARAMS,
  estimateStorageBytes,
  formatBytes,
  replayBotGames,
  type EvolveParams,
} from './evolve/index.ts'
import { Orchestrator } from './evolve/orchestrator.ts'
import { defaultShape, genomeLength, INPUT_SIZE, OUTPUT_SIZE } from './nn/index.ts'
import { DashboardCharts } from './ui/charts.ts'
import { iconBtn, icons } from './ui/icons.ts'
import { renderScoresheet, SCORESHEET_GAME_COLS } from './ui/scoresheet.ts'
import { downloadJson, loadCheckpoint, saveCheckpoint } from './store/idb.ts'

type PaneId = 'fitness' | 'hist' | 'console' | 'table' | 'sheet'
type SortKey = 'id' | 'fitness' | 'parentA' | 'parentB' | 'games'
type BotRow = {
  id: number
  fitness: number
  parentA: number | null
  parentB: number | null
  gameScores: number[]
}

const FOCUS_CLASSES = [
  'focus-fitness',
  'focus-hist',
  'focus-console',
  'focus-table',
  'focus-sheet',
] as const

const SORT_COLUMNS: { key: SortKey; label: string }[] = [
  { key: 'id', label: 'Bot' },
  { key: 'fitness', label: 'Score' },
  { key: 'parentA', label: 'Parent A' },
  { key: 'parentB', label: 'Parent B' },
  { key: 'games', label: 'Games' },
]

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

function numInput(id: string, label: string, value: number, step = 'any', span2 = false): HTMLLabelElement {
  const input = el('input', { id, type: 'number', value: String(value), step })
  const lab = el('label', span2 ? { class: 'span2' } : {}, [label, input])
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

const app = document.querySelector<HTMLDivElement>('#app')!
app.innerHTML = ''

const hero = el('header', { class: 'hero' }, [
  el('div', { class: 'hero-copy' }, [
    el('h1', {}, ['DiceLab']),
    el('p', { class: 'tag' }, [
      'Breed tiny nets that play Yahtzee. Twist the knobs, hit Run, watch the scores climb.',
    ]),
  ]),
])
app.append(hero)

const about = el('details', { class: 'about' }, [
  el('summary', {}, ['How it works']),
  el('div', { class: 'about-body' }, [
    el('p', {}, [
      'Each bot plays a few full games; its fitness is the average score. You start with a pool of random seeds. New bots are children of two parents, with a chance of mutation.',
    ]),
    el('p', {}, [
      'Parents are drawn by lottery: tickets = score^k (k between 1 and 2). Higher scores win more tickets, but nobody is culled until you hit max bots. Old bots stay in the pool, so ticket totals only grow.',
    ]),
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
layout.append(setupPanel, mainPanel)

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

const form = el('div', { class: 'form-grid' })
const fields = {
  k: numInput('k', 'Lottery k (1-2)', DEFAULT_PARAMS.k, '0.05'),
  seedCount: numInput('seedCount', 'Seed bots', DEFAULT_PARAMS.seedCount, '1'),
  gamesPerFitness: numInput('gamesPerFitness', 'Games / fitness', DEFAULT_PARAMS.gamesPerFitness, '1'),
  pMut: numInput('pMut', 'Mutation chance', DEFAULT_PARAMS.pMut, '0.01'),
  mutSigma: numInput('mutSigma', 'Mutation sigma', DEFAULT_PARAMS.mutSigma, '0.01'),
  maxBots: numInput('maxBots', 'Max bots (prune)', DEFAULT_PARAMS.maxBots, '1'),
  hidden1: numInput('hidden1', 'Hidden layer 1', DEFAULT_PARAMS.hidden1, '1'),
  hidden2: numInput('hidden2', 'Hidden layer 2', DEFAULT_PARAMS.hidden2, '1'),
  endMaxBots: numInput('endMaxBots', 'End: total bots (0=off)', DEFAULT_PARAMS.endMaxBots, '1'),
  endTargetScore: numInput('endTargetScore', 'End: target score (0=off)', DEFAULT_PARAMS.endTargetScore, '1'),
  endStagnation: numInput('endStagnation', 'End: stagnation (0=off)', DEFAULT_PARAMS.endStagnation, '1'),
  batchSize: numInput('batchSize', 'Eval batch size', DEFAULT_PARAMS.batchSize, '1'),
}
for (const f of Object.values(fields)) form.append(f)
setupInner.append(form)

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
const sheetBtn = iconBtn('', 'sheet', 'Sheet', { title: 'Top bot scoresheet' })
sheetBtn.disabled = true
toolbar.append(setupToggleBtn, runBtn, pauseBtn, resetBtn, sheetBtn)
mainPanel.append(toolbar)

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
const sortHeaders = new Map<SortKey, HTMLTableCellElement>()
for (const col of SORT_COLUMNS) {
  const th = el('th', { scope: 'col' })
  const btn = el('button', { type: 'button' }, [col.label])
  btn.addEventListener('click', () => setSort(col.key))
  th.append(btn)
  theadRow.append(th)
  sortHeaders.set(col.key, th)
}
const thead = el('thead', {}, [theadRow])
const tbody = el('tbody')
table.append(thead, tbody)
tableWrap.append(table)

let tableRows: BotRow[] = []
let sortKey: SortKey = 'fitness'
let sortDir: 1 | -1 = -1
let consoleLines: string[] = ['Ready.']
const pendingBots: BotRow[] = []
const pendingLogs: string[] = []
let pendingStats: { created: number; best: number; bestId: number; popSize: number } | null = null
let flushTimer: ReturnType<typeof setInterval> | null = null
let consoleRaf: number | null = null

const scoresheetHost = el('div', { class: 'scoresheet-host' })
renderScoresheet(scoresheetHost, null)

const fitnessPane = makePane('fitness', 'Fitness', lineBox)
const histPane = makePane('hist', 'Score buckets', histBox)
const consolePane = makePane('console', 'Terminal', consoleEl)
const tablePane = makePane('table', 'Top 50', tableWrap)
const sheetPane = makePane('sheet', 'Scoresheet', scoresheetHost)
workspace.append(
  fitnessPane.pane,
  histPane.pane,
  consolePane.pane,
  tablePane.pane,
  sheetPane.pane,
)

const paneMaxBtns: Record<PaneId, HTMLButtonElement> = {
  fitness: fitnessPane.maxBtn,
  hist: histPane.maxBtn,
  console: consolePane.maxBtn,
  table: tablePane.maxBtn,
  sheet: sheetPane.maxBtn,
}

let sheetBestId = 0

const charts = new DashboardCharts(lineCanvas, histCanvas)
let orch = new Orchestrator(DEFAULT_PARAMS)
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

new ResizeObserver(() => charts.resize()).observe(workspace)

function readParams(): EvolveParams {
  const g = (id: keyof typeof fields) => Number((fields[id].querySelector('input') as HTMLInputElement).value)
  return {
    k: Math.min(2, Math.max(1, g('k'))),
    seedCount: Math.max(1, Math.floor(g('seedCount'))),
    gamesPerFitness: Math.max(1, Math.floor(g('gamesPerFitness'))),
    pMut: Math.max(0, Math.min(1, g('pMut'))),
    mutSigma: Math.max(0, g('mutSigma')),
    maxBots: Math.max(10, Math.floor(g('maxBots'))),
    hidden1: Math.max(4, Math.floor(g('hidden1'))),
    hidden2: Math.max(4, Math.floor(g('hidden2'))),
    endMaxBots: Math.max(0, Math.floor(g('endMaxBots'))),
    endTargetScore: Math.max(0, g('endTargetScore')),
    endStagnation: Math.max(0, Math.floor(g('endStagnation'))),
    batchSize: Math.max(1, Math.floor(g('batchSize'))),
  }
}

function updateSpaceHint(): void {
  const p = readParams()
  const shape = defaultShape(INPUT_SIZE, OUTPUT_SIZE, p.hidden1, p.hidden2)
  const glen = genomeLength(shape)
  const bytes = estimateStorageBytes(glen, p.maxBots)
  spaceHint.textContent = `~${formatBytes(glen * 4)} per bot (${glen} weights). Cap ${p.maxBots} bots: ~${formatBytes(bytes)}. Prune kicks in above the cap.`
}

for (const f of Object.values(fields)) {
  f.querySelector('input')!.addEventListener('input', updateSpaceHint)
}
updateSpaceHint()

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

function sortValue(bot: BotRow, key: SortKey): number {
  if (key === 'id') return bot.id
  if (key === 'fitness') return bot.fitness
  if (key === 'parentA') return bot.parentA ?? -1
  if (key === 'parentB') return bot.parentB ?? -1
  if (bot.gameScores.length === 0) return -1
  let sum = 0
  for (const s of bot.gameScores) sum += s
  return sum / bot.gameScores.length
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
    return d !== 0 ? d : (b.id - a.id)
  })
  tbody.replaceChildren(
    ...sorted.map((bot) =>
      el('tr', {}, [
        el('td', {}, [String(bot.id)]),
        el('td', {}, [bot.fitness.toFixed(1)]),
        el('td', {}, [bot.parentA === null ? '-' : String(bot.parentA)]),
        el('td', {}, [bot.parentB === null ? '-' : String(bot.parentB)]),
        el('td', {}, [bot.gameScores.map((x) => x.toFixed(0)).join(', ')]),
      ]),
    ),
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

function refreshScoresheet(force = false): void {
  const bestId = orch.pop.bestId
  sheetBtn.disabled = bestId === 0
  if (bestId === 0) {
    if (sheetBestId !== 0 || force) {
      sheetBestId = 0
      renderScoresheet(scoresheetHost, null)
    }
    return
  }
  if (!force && focusedPane !== 'sheet') return
  if (!force && bestId === sheetBestId) return

  const bot = orch.pop.getBot(bestId)
  if (!bot) {
    renderScoresheet(scoresheetHost, null)
    sheetBestId = 0
    return
  }

  const replay = replayBotGames(bot, orch.pop.shape, SCORESHEET_GAME_COLS)
  if (!replay.matched) {
    appendLog(`Scoresheet replay mismatch for bot #${bestId} (seed/checkpoint drift?)`)
  }
  renderScoresheet(scoresheetHost, {
    botId: bot.id,
    fitness: bot.fitness,
    gamesPlayed: bot.gameScores.length,
    games: replay.games,
    matched: replay.matched,
  })
  sheetBestId = bestId
}

function openScoresheet(): void {
  setFocusedPane('sheet')
  refreshScoresheet(true)
}

function applyStats(s: { created: number; best: number; bestId: number; popSize: number }): void {
  ;(document.getElementById('statCreated') as HTMLElement).textContent = String(s.created)
  ;(document.getElementById('statPop') as HTMLElement).textContent = String(s.popSize)
  ;(document.getElementById('statBest') as HTMLElement).textContent =
    `${s.best.toFixed(1)} (#${s.bestId})`
  sheetBtn.disabled = s.bestId === 0
  if (focusedPane === 'sheet' && s.bestId !== sheetBestId) refreshScoresheet(true)
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
  } else if (focusedPane === 'sheet' && orch.pop.bestId !== sheetBestId) {
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

function setSort(key: SortKey): void {
  if (sortKey === key) sortDir = sortDir < 0 ? 1 : -1
  else {
    sortKey = key
    sortDir = -1
  }
  renderTable()
}

updateSortHeaders()

function wireOrch(): void {
  unsub?.()
  unsub = orch.on((e) => {
    if (e.type === 'log') {
      pendingLogs.push(e.line)
      while (pendingLogs.length > CONSOLE_MAX_LINES) pendingLogs.shift()
      scheduleConsoleFlush()
    }
    if (e.type === 'bot') {
      pendingBots.push({
        id: e.bot.id,
        fitness: e.bot.fitness,
        parentA: e.bot.parentA,
        parentB: e.bot.parentB,
        gameScores: e.bot.gameScores,
      })
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
  for (const f of Object.values(fields)) {
    ;(f.querySelector('input') as HTMLInputElement).disabled = disabled
  }
}

wireOrch()

runBtn.addEventListener('click', () => {
  const p = readParams()
  if (orch.pop.bots.length === 0) {
    orch.configure(p)
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
sheetBtn.addEventListener('click', () => openScoresheet())

resetBtn.addEventListener('click', () => {
  orch.pause()
  stopFlushTimer()
  clearUiBuffer()
  orch = new Orchestrator(readParams())
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
  if (focusedPane === 'sheet') setFocusedPane(null)
})

saveBtn.addEventListener('click', () => {
  void saveCheckpoint(orch.pop.serializeMeta()).then(() => appendLog('Saved checkpoint to IndexedDB.'))
})

loadBtn.addEventListener('click', () => {
  void loadCheckpoint<ReturnType<typeof orch.pop.serializeMeta>>().then((data) => {
    if (!data) {
      appendLog('No checkpoint found.')
      return
    }
    orch.pause()
    stopFlushTimer()
    clearUiBuffer()
    orch = new Orchestrator(DEFAULT_PARAMS)
    orch.pop.loadSerialized(data as Parameters<typeof orch.pop.loadSerialized>[0])
    wireOrch()
    charts.reset()
    const loaded: BotRow[] = orch.pop.bots.map((b) => ({
      id: b.id,
      fitness: b.fitness,
      parentA: b.parentA,
      parentB: b.parentB,
      gameScores: b.gameScores,
    }))
    if (loaded.length > 0) {
      charts.addBatch(loaded.map((b) => ({ id: b.id, fitness: b.fitness })))
    }
    tableRows = mergeTopBots([], loaded, TABLE_TOP_N)
    renderTable()
    appendLog(`Loaded ${orch.pop.bots.length} bots from IndexedDB.`)
    applyStats({
      created: orch.pop.nextId - 1,
      best: orch.pop.bestFitness,
      bestId: orch.pop.bestId,
      popSize: orch.pop.bots.length,
    })
    sheetBestId = -1
    refreshScoresheet(true)
  })
})

exportBtn.addEventListener('click', () => {
  downloadJson(`dicelab-bots-${Date.now()}.json`, orch.pop.serializeMeta())
  appendLog('Exported JSON download.')
})

pauseBtn.disabled = true
setupToggleBtn.setAttribute('aria-pressed', 'true')
scheduleChartResize()
