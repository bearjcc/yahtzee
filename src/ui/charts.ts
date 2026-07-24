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

export class DashboardCharts {
  private line: Chart
  private hist: Chart
  private ids: number[] = []
  private scores: number[] = []
  private bests: number[] = []

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
          x: { title: { display: true, text: 'Score bucket (25 pts)' } },
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
    this.line.data.labels = []
    this.line.data.datasets[0]!.data = []
    this.line.data.datasets[1]!.data = []
    this.line.update()
    this.rebuildHist()
  }

  addBot(id: number, fitness: number): void {
    this.ids.push(id)
    this.scores.push(fitness)
    const best = this.bests.length
      ? Math.max(this.bests[this.bests.length - 1]!, fitness)
      : fitness
    this.bests.push(best)

    // downsample display if huge
    const step = Math.max(1, Math.floor(this.ids.length / 800))
    const labels: number[] = []
    const fit: number[] = []
    const bst: number[] = []
    for (let i = 0; i < this.ids.length; i += step) {
      labels.push(this.ids[i]!)
      fit.push(this.scores[i]!)
      bst.push(this.bests[i]!)
    }
    this.line.data.labels = labels
    this.line.data.datasets[0]!.data = fit
    this.line.data.datasets[1]!.data = bst
    this.line.update('none')
    this.rebuildHist()
  }

  private rebuildHist(): void {
    const bucket = 25
    const counts = new Map<number, number>()
    let maxBucket = 0
    for (const s of this.scores) {
      const b = Math.floor(s / bucket) * bucket
      counts.set(b, (counts.get(b) ?? 0) + 1)
      if (b > maxBucket) maxBucket = b
    }
    const labels: string[] = []
    const data: number[] = []
    for (let b = 0; b <= maxBucket; b += bucket) {
      labels.push(`${b}-${b + bucket - 1}`)
      data.push(counts.get(b) ?? 0)
    }
    this.hist.data.labels = labels
    this.hist.data.datasets[0]!.data = data
    this.hist.update('none')
  }
}
