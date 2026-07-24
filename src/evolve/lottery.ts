import type { Rng } from '../engine/rng.ts'

const EPSILON = 0.1

export function ticketsForScore(score: number, k: number): number {
  return Math.pow(Math.max(score, EPSILON), k)
}

export class Lottery {
  private ids: number[] = []
  private tickets: number[] = []
  private cumulative: number[] = []
  private total = 0
  private k: number

  constructor(k: number) {
    this.k = k
  }

  setK(k: number): void {
    this.k = k
    this.rebuildFromScores(this.ids.map((id, i) => ({ id, score: this.scoreFromTickets(i) })))
  }

  /** When only tickets known, cannot recover score; prefer add(id, score). */
  private scoreFromTickets(i: number): number {
    return Math.pow(this.tickets[i]!, 1 / this.k)
  }

  clear(): void {
    this.ids = []
    this.tickets = []
    this.cumulative = []
    this.total = 0
  }

  add(id: number, score: number): void {
    const t = ticketsForScore(score, this.k)
    this.ids.push(id)
    this.tickets.push(t)
    this.total += t
    this.cumulative.push(this.total)
  }

  removeIds(remove: Set<number>): void {
    const nextIds: number[] = []
    const nextTickets: number[] = []
    for (let i = 0; i < this.ids.length; i++) {
      if (remove.has(this.ids[i]!)) continue
      nextIds.push(this.ids[i]!)
      nextTickets.push(this.tickets[i]!)
    }
    this.ids = nextIds
    this.tickets = nextTickets
    this.rebuildCumulative()
  }

  rebuildFromScores(rows: { id: number; score: number }[]): void {
    this.clear()
    for (const r of rows) this.add(r.id, r.score)
  }

  private rebuildCumulative(): void {
    this.cumulative = []
    this.total = 0
    for (const t of this.tickets) {
      this.total += t
      this.cumulative.push(this.total)
    }
  }

  get totalTickets(): number {
    return this.total
  }

  get size(): number {
    return this.ids.length
  }

  draw(rng: Rng): number {
    if (this.ids.length === 0) throw new Error('empty lottery')
    if (this.total <= 0) return this.ids[Math.floor(rng() * this.ids.length)]!
    const r = rng() * this.total
    let lo = 0
    let hi = this.cumulative.length - 1
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (this.cumulative[mid]! < r) lo = mid + 1
      else hi = mid
    }
    return this.ids[lo]!
  }
}
