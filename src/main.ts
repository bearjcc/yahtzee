import './style.css'
import {
  DEFAULT_PARAMS,
  estimateStorageBytes,
  formatBytes,
  type EvolveParams,
} from './evolve/index.ts'
import { Orchestrator } from './evolve/orchestrator.ts'
import { defaultShape, genomeLength, INPUT_SIZE, OUTPUT_SIZE } from './nn/index.ts'
import { DashboardCharts } from './ui/charts.ts'
import { downloadJson, loadCheckpoint, saveCheckpoint } from './store/idb.ts'

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

const app = document.querySelector<HTMLDivElement>('#app')!
app.innerHTML = ''

app.append(
  el('div', { class: 'badge-strip' }, [
    el('span', { class: 'badge' }, ['JS / Workers']),
    el('span', { class: 'badge' }, ['Win98–XP energy']),
    el('span', { class: 'badge' }, ['Bonus disc util']),
    el('span', { class: 'badge' }, ['Not affiliated']),
  ]),
)

const hero = el('header', { class: 'hero' }, [
  el('div', {}, [
    el('h1', {}, ['DiceLab']),
    el('div', { class: 'tag' }, [
      'Neuroevolution trainer for solitaire dice scoring. Append-only lottery population. Function first.',
    ]),
  ]),
])
app.append(hero)

const layout = el('div', { class: 'layout' })
app.append(layout)

const setupPanel = el('section', { class: 'panel' })
const mainPanel = el('section', { class: 'panel' })
layout.append(setupPanel, mainPanel)

setupPanel.append(el('h2', {}, ['Setup parameters']))

const form = el('div', { class: 'form-grid' })
const fields = {
  k: numInput('k', 'Lottery k (1–2)', DEFAULT_PARAMS.k, '0.05'),
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
setupPanel.append(form)

const spaceHint = el('p', { class: 'hint', id: 'spaceHint' }, [''])
setupPanel.append(spaceHint)

const btnRow = el('div', { class: 'btn-row' })
const runBtn = el('button', { class: 'bevel primary', type: 'button' }, ['Run'])
const pauseBtn = el('button', { class: 'bevel', type: 'button' }, ['Pause'])
const resetBtn = el('button', { class: 'bevel', type: 'button' }, ['Reset'])
const saveBtn = el('button', { class: 'bevel', type: 'button' }, ['Save'])
const loadBtn = el('button', { class: 'bevel', type: 'button' }, ['Load'])
const exportBtn = el('button', { class: 'bevel', type: 'button' }, ['Export JSON'])
btnRow.append(runBtn, pauseBtn, resetBtn, saveBtn, loadBtn, exportBtn)
setupPanel.append(btnRow)

mainPanel.append(el('h2', {}, ['Live overview']))
const statsBar = el('div', { class: 'stats-bar' }, [
  el('span', {}, ['Created: ', el('b', { id: 'statCreated' }, ['0'])]),
  el('span', {}, ['Pop: ', el('b', { id: 'statPop' }, ['0'])]),
  el('span', {}, ['Best: ', el('b', { id: 'statBest' }, ['—'])]),
  el('span', {}, ['Status: ', el('b', { id: 'statStatus' }, ['idle'])]),
])
mainPanel.append(statsBar)

const chartsDiv = el('div', { class: 'charts' })
const lineBox = el('div', { class: 'chart-box' })
const histBox = el('div', { class: 'chart-box' })
const lineCanvas = el('canvas')
const histCanvas = el('canvas')
lineBox.append(lineCanvas)
histBox.append(histCanvas)
chartsDiv.append(lineBox, histBox)
mainPanel.append(chartsDiv)

const consoleEl = el('div', { class: 'console', id: 'console' }, ['Ready.\n'])
mainPanel.append(consoleEl)

const tableWrap = el('div', { class: 'table-wrap' })
const table = el('table', { class: 'bots' })
table.innerHTML =
  '<thead><tr><th>Bot</th><th>Score</th><th>Parent A</th><th>Parent B</th><th>Games</th></tr></thead>'
const tbody = el('tbody')
table.append(tbody)
tableWrap.append(table)
mainPanel.append(tableWrap)

app.append(
  el('p', { class: 'disclaimer' }, [
    'Unofficial fan experiment. Not affiliated with Hasbro, General Mills, or any toy/cereal brand. Dice scoring rules are public-domain game mechanics.',
  ]),
)

const charts = new DashboardCharts(lineCanvas, histCanvas)
let orch = new Orchestrator(DEFAULT_PARAMS)
let unsub: (() => void) | null = null

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
  spaceHint.textContent = `Genome ${glen} floats (${formatBytes(glen * 4)}/bot). At maxBots=${p.maxBots}: ~${formatBytes(bytes)} (genomes + row overhead). Prune starts above maxBots.`
}

for (const f of Object.values(fields)) {
  f.querySelector('input')!.addEventListener('input', updateSpaceHint)
}
updateSpaceHint()

function appendLog(line: string): void {
  consoleEl.textContent += line + '\n'
  consoleEl.scrollTop = consoleEl.scrollHeight
}

function prependRow(bot: {
  id: number
  fitness: number
  parentA: number | null
  parentB: number | null
  gameScores: number[]
}): void {
  const tr = el('tr', {}, [
    el('td', {}, [String(bot.id)]),
    el('td', {}, [bot.fitness.toFixed(1)]),
    el('td', {}, [bot.parentA === null ? '—' : String(bot.parentA)]),
    el('td', {}, [bot.parentB === null ? '—' : String(bot.parentB)]),
    el('td', {}, [bot.gameScores.map((x) => x.toFixed(0)).join(', ')]),
  ])
  tbody.insertBefore(tr, tbody.firstChild)
  while (tbody.children.length > 500) tbody.removeChild(tbody.lastChild!)
}

function wireOrch(): void {
  unsub?.()
  unsub = orch.on((e) => {
    if (e.type === 'log') appendLog(e.line)
    if (e.type === 'bot') {
      charts.addBot(e.bot.id, e.bot.fitness)
      prependRow(e.bot)
    }
    if (e.type === 'stats') {
      ;(document.getElementById('statCreated') as HTMLElement).textContent = String(e.created)
      ;(document.getElementById('statPop') as HTMLElement).textContent = String(e.popSize)
      ;(document.getElementById('statBest') as HTMLElement).textContent =
        `${e.best.toFixed(1)} (#${e.bestId})`
    }
    if (e.type === 'status') {
      ;(document.getElementById('statStatus') as HTMLElement).textContent = e.running
        ? 'running'
        : e.reason ?? 'idle'
      runBtn.disabled = e.running
      pauseBtn.disabled = !e.running
      setFormDisabled(e.running)
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
    tbody.innerHTML = ''
    consoleEl.textContent = ''
  }
  void orch.start()
})

pauseBtn.addEventListener('click', () => orch.pause())

resetBtn.addEventListener('click', () => {
  orch.pause()
  orch = new Orchestrator(readParams())
  wireOrch()
  charts.reset()
  tbody.innerHTML = ''
  consoleEl.textContent = 'Reset.\n'
  ;(document.getElementById('statCreated') as HTMLElement).textContent = '0'
  ;(document.getElementById('statPop') as HTMLElement).textContent = '0'
  ;(document.getElementById('statBest') as HTMLElement).textContent = '—'
  ;(document.getElementById('statStatus') as HTMLElement).textContent = 'idle'
  runBtn.disabled = false
  setFormDisabled(false)
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
    orch = new Orchestrator(DEFAULT_PARAMS)
    orch.pop.loadSerialized(data as Parameters<typeof orch.pop.loadSerialized>[0])
    wireOrch()
    charts.reset()
    tbody.innerHTML = ''
    for (const b of orch.pop.bots) {
      charts.addBot(b.id, b.fitness)
      prependRow(b)
    }
    appendLog(`Loaded ${orch.pop.bots.length} bots from IndexedDB.`)
    ;(document.getElementById('statCreated') as HTMLElement).textContent = String(orch.pop.nextId - 1)
    ;(document.getElementById('statPop') as HTMLElement).textContent = String(orch.pop.bots.length)
    ;(document.getElementById('statBest') as HTMLElement).textContent =
      `${orch.pop.bestFitness.toFixed(1)} (#${orch.pop.bestId})`
  })
})

exportBtn.addEventListener('click', () => {
  downloadJson(`dicelab-bots-${Date.now()}.json`, orch.pop.serializeMeta())
  appendLog('Exported JSON download.')
})

pauseBtn.disabled = true
