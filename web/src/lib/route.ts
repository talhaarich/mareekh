/**
 * Route finder: Dijkstra on walking time over the grid, eight neighbours, blocked cells never entered.
 * Design: docs/HOW_IT_WORKS.md section 4. Runs in the router worker; plain functions so it can be tested.
 * Times are kept in 64-bit floats throughout (Float64Array), as the brief asks.
 */

import { NEIGHBOURS, neighbourIndex, stepTimeS, type SpeedModel } from './cost'
import type { Grid } from './grid'

/** Binary min-heap of cell indices keyed by time. Stale entries are skipped by the caller. */
class MinHeap {
  private keys = new Float64Array(1024)
  private items = new Int32Array(1024)
  size = 0

  push(item: number, key: number): void {
    if (this.size === this.keys.length) {
      const keys = new Float64Array(this.size * 2)
      const items = new Int32Array(this.size * 2)
      keys.set(this.keys)
      items.set(this.items)
      this.keys = keys
      this.items = items
    }
    let i = this.size++
    while (i > 0) {
      const parent = (i - 1) >> 1
      if (this.keys[parent] <= key) break
      this.keys[i] = this.keys[parent]
      this.items[i] = this.items[parent]
      i = parent
    }
    this.keys[i] = key
    this.items[i] = item
  }

  /** Removes and returns the item with the smallest key. Only call when size > 0. */
  pop(): number {
    const top = this.items[0]
    const n = --this.size
    if (n > 0) {
      const key = this.keys[n]
      const item = this.items[n]
      let i = 0
      for (;;) {
        let child = 2 * i + 1
        if (child >= n) break
        if (child + 1 < n && this.keys[child + 1] < this.keys[child]) child++
        if (this.keys[child] >= key) break
        this.keys[i] = this.keys[child]
        this.items[i] = this.items[child]
        i = child
      }
      this.keys[i] = key
      this.items[i] = item
    }
    return top
  }
}

export interface SearchResult {
  /**
   * Seconds per cell: from the source (forward) or to the source (reverse). Infinity when unreachable.
   * Cells the search did not finish (it stops early at `goal`) may hold upper bounds or Infinity.
   */
  timeS: Float64Array
  /** Previous cell on the best route (forward), or next cell toward the source (reverse). -1 if none. */
  prev: Int32Array
}

export interface SearchOptions {
  /** Stop as soon as this cell's time is final. Omit to fill the whole grid. */
  goal?: number
  /**
   * Walk toward the source instead of away from it: timeS[i] is the time to walk from i to the source.
   * Used for the walk-home field, because uphill and downhill cost differently.
   */
  reverse?: boolean
}

/**
 * Dijkstra from one cell. A step into a blocked cell is never taken; the source itself may be blocked
 * (you can always leave where you stand), but in reverse mode nothing can reach a blocked source.
 */
export function search(grid: Grid, blocked: Uint8Array, model: SpeedModel, source: number, opts: SearchOptions = {}): SearchResult {
  const { width, resM } = grid.meta
  const n = grid.dem.length
  const timeS = new Float64Array(n).fill(Infinity)
  const prev = new Int32Array(n).fill(-1)
  const done = new Uint8Array(n)
  const heap = new MinHeap()
  const goal = opts.goal ?? -1
  const reverse = opts.reverse === true

  timeS[source] = 0
  heap.push(source, 0)
  while (heap.size > 0) {
    const u = heap.pop()
    if (done[u]) continue
    done[u] = 1
    if (u === goal) break
    const row = Math.floor(u / width)
    const col = u - row * width
    for (let k = 0; k < NEIGHBOURS.length; k++) {
      const v = neighbourIndex(grid.meta, row, col, k)
      if (v < 0 || done[v]) continue
      const flatM = resM * NEIGHBOURS[k].flatFactor
      const step = reverse ? stepTimeS(grid, blocked, model, v, u, flatM) : stepTimeS(grid, blocked, model, u, v, flatM)
      if (step === Infinity) continue
      const t = timeS[u] + step
      if (t < timeS[v]) {
        timeS[v] = t
        prev[v] = u
        heap.push(v, t)
      }
    }
  }
  return { timeS, prev }
}

/** Cells from `source` to `goal` along a forward search's `prev`, or null when goal was not reached. */
export function pathCells(prev: Int32Array, source: number, goal: number): number[] | null {
  if (goal !== source && prev[goal] === -1) return null
  const cells = [goal]
  for (let c = goal; c !== source; ) {
    c = prev[c]
    cells.push(c)
  }
  return cells.reverse()
}

export interface Route {
  /** False when no path exists under the slope limit. */
  ok: boolean
  /** Cell indices from start to goal, inclusive. Empty when ok is false. */
  cells: number[]
  /** Walking time, seconds. Infinity when ok is false. */
  timeS: number
}

/** Fastest route between two cells. */
export function findRoute(grid: Grid, blocked: Uint8Array, model: SpeedModel, start: number, goal: number): Route {
  const { timeS, prev } = search(grid, blocked, model, start, { goal })
  const cells = pathCells(prev, start, goal)
  if (!cells) return { ok: false, cells: [], timeS: Infinity }
  return { ok: true, cells, timeS: timeS[goal] }
}
