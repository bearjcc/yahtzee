import {
  Chart,
  LineController,
  LineElement,
  PointElement,
  LinearScale,
  CategoryScale,
  BarController,
  BarElement,
  Title,
  Legend,
  Filler,
  type ChartConfiguration,
} from 'chart.js'

Chart.register(
  LineController,
  LineElement,
  PointElement,
  LinearScale,
  CategoryScale,
  BarController,
  BarElement,
  Title,
  Legend,
  Filler,
)

const HIST_BUCKET = 50
const MAX_LINE_POINTS = 400

export class DashboardCharts {
  private line: Chart
  private hist: Chart
  private ids: number[] = []
  private scores: number[] = []
  private bests: number[] = []
  private histCounts = new Map<number, number>()
  private histMaxBucket = 0
  private bestSoFar = -Infinity

  constructor(lineCanvas: HTMLCanvasElement, histCanvas: HTMLCanvasElement) {
    const lineCfg: ChartConfiguration<'line'> = {
      type: 'line',
      data: {
        labels: [],
        datasets: [
          {
            label: 'Fitness',
            data: [],
            borderColor: '#c4122f',
            backgroundColor: '#c4122f33',
            pointRadius: 0,
            borderWidth: 1.5,
            tension: 0.1,
          },
          {
            label: 'Best so far',
            data: [],
            borderColor: '#c9970a',
            pointRadius: 0,
            borderWidth: 2,
            tension: 0,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        plugins: { legend: { labels: { boxWidth: 12, font: { size: 10 } } } },
        scales: {
          x: { title: { display: true, text: 'Bot #' }, ticks: { maxTicksLimit: 8 } },
          y: { title: { display: true, text: 'Score' } },
        },
      },
    }
    this.line = new Chart(lineCanvas, lineCfg)

    const histCfg: ChartConfiguration<'bar'> = {
      type: 'bar',
      data: {
        labels: [],
        datasets: [
          {
            label: 'Count',
            data: [],
            backgroundColor: '#c4122fcc',
            borderColor: '#8a0c20',
            borderWidth: 1,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { title: { display: true, text: `Score bucket (${HIST_BUCKET} pts)` } },
          y: { title: { display: true, text: 'Bots' }, beginAtZero: true },
        },
      },
    }
    this.hist = new Chart(histCanvas, histCfg)
  }

  resize(): void {
    this.line.resize()
    this.hist.resize()
  }

  reset(): void {
    this.ids = []
    this.scores = []
    this.bests = []
    this.histCounts.clear()
    this.histMaxBucket = 0
    this.bestSoFar = -Infinity
    this.line.data.labels = []
    this.line.data.datasets[0]!.data = []
    this.line.data.datasets[1]!.data = []
    this.line.update()
    this.applyHist()
  }

  /** One line point (mean fitness / last id); hist counts every sample. */
  addBatch(samples: { id: number; fitness: number }[]): void {
    if (samples.length === 0) return

    let sum = 0
    let maxFit = -Infinity
    let lastId = samples[0]!.id
    for (const s of samples) {
      sum += s.fitness
      if (s.fitness > maxFit) maxFit = s.fitness
      lastId = s.id
      const b = Math.floor(s.fitness / HIST_BUCKET) * HIST_BUCKET
      this.histCounts.set(b, (this.histCounts.get(b) ?? 0) + 1)
      if (b > this.histMaxBucket) this.histMaxBucket = b
    }

    const mean = sum / samples.length
    if (maxFit > this.bestSoFar) this.bestSoFar = maxFit

    this.ids.push(lastId)
    this.scores.push(mean)
    this.bests.push(this.bestSoFar)

    if (this.ids.length > MAX_LINE_POINTS) {
      const step = Math.ceil(this.ids.length / MAX_LINE_POINTS)
      const nIds: number[] = []
      const nScores: number[] = []
      const nBests: number[] = []
      for (let i = 0; i < this.ids.length; i += step) {
        nIds.push(this.ids[i]!)
        nScores.push(this.scores[i]!)
        nBests.push(this.bests[i]!)
      }
      this.ids = nIds
      this.scores = nScores
      this.bests = nBests
    }

    this.line.data.labels = this.ids
    this.line.data.datasets[0]!.data = this.scores
    this.line.data.datasets[1]!.data = this.bests
    this.line.update('none')
    this.applyHist()
  }

  private applyHist(): void {
    const labels: string[] = []
    const data: number[] = []
    for (let b = 0; b <= this.histMaxBucket; b += HIST_BUCKET) {
      labels.push(`${b}-${b + HIST_BUCKET - 1}`)
      data.push(this.histCounts.get(b) ?? 0)
    }
    this.hist.data.labels = labels
    this.hist.data.datasets[0]!.data = data
    this.hist.update('none')
  }
}
