import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { parseAssumptions } from '../state/data'
import { blockedMask, NEIGHBOURS, neighbourIndex, speedModelFromAssumptions, stepTimeS } from './cost'
import { cellIndex, loadGrid, type FetchFile, type Grid } from './grid'
import { findRoute, search } from './route'

const examples = new URL('../../../examples/data/', import.meta.url)
const assumptions = parseAssumptions(JSON.parse(await readFile(new URL('jezero/assumptions.json', examples), 'utf-8')))
const model = speedModelFromAssumptions(assumptions)
const LIMIT = 15 // degrees, the slope limit the tests plan with
const STEEP = 30 // degrees, slope of a wall cell

/** A width x height test grid at 20 m. Heights from `dem(row, col)`; cells listed in `walls` are too steep to enter. */
function makeGrid(width: number, height: number, walls: [number, number][] = [], dem: (r: number, c: number) => number = () => 0): Grid {
  const meta = { width, height, resM: 20, bounds: [18, 77, 18.01, 77.01] as [number, number, number, number], nodata: -9999, dem: 'dem.bin', slope: 'slope.bin' }
  const d = new Float32Array(width * height)
  const s = new Float32Array(width * height)
  for (let r = 0; r < height; r++) for (let c = 0; c < width; c++) d[r * width + c] = dem(r, c)
  for (const [r, c] of walls) s[r * width + c] = STEEP
  return { meta, dem: d, slope: s }
}

const flatSide = 20 / model.vmaxMs // seconds for one flat side step
const flatDiag = (20 * Math.SQRT2) / model.vmaxMs

/** Every step is to a neighbour, never into a blocked cell, and the step times add up to the route time. */
function checkRoute(grid: Grid, blocked: Uint8Array, cells: number[], timeS: number) {
  const w = grid.meta.width
  let total = 0
  for (let i = 1; i < cells.length; i++) {
    const [a, b] = [cells[i - 1], cells[i]]
    const k = NEIGHBOURS.findIndex((_, j) => neighbourIndex(grid.meta, Math.floor(a / w), a % w, j) === b)
    expect(k, `step ${i} is not to a neighbour`).toBeGreaterThanOrEqual(0)
    expect(blocked[b], `step ${i} enters a blocked cell`).toBe(0)
    total += stepTimeS(grid, blocked, model, a, b, grid.meta.resM * NEIGHBOURS[k].flatFactor)
  }
  expect(total).toBeCloseTo(timeS, 9)
}

describe('the three test grids (brief, task 5)', () => {
  it('open: walks straight, and diagonally when that is shorter', () => {
    const g = makeGrid(10, 10)
    const blocked = blockedMask(g, LIMIT)
    const east = findRoute(g, blocked, model, cellIndex(g.meta, 5, 0), cellIndex(g.meta, 5, 9))
    expect(east.ok).toBe(true)
    expect(east.cells).toHaveLength(10)
    expect(east.cost).toBeCloseTo(9 * flatSide, 9)
    const diag = findRoute(g, blocked, model, cellIndex(g.meta, 0, 0), cellIndex(g.meta, 9, 9))
    expect(diag.cost).toBeCloseTo(9 * flatDiag, 9)
    checkRoute(g, blocked, diag.cells, diag.cost)
  })

  it('wall with a gap: goes through the gap', () => {
    const gapRow = 8
    const walls: [number, number][] = []
    for (let r = 0; r < 10; r++) if (r !== gapRow) walls.push([r, 5])
    const g = makeGrid(10, 10, walls)
    const blocked = blockedMask(g, LIMIT)
    const route = findRoute(g, blocked, model, cellIndex(g.meta, 2, 1), cellIndex(g.meta, 2, 8))
    expect(route.ok).toBe(true)
    expect(route.cells).toContain(cellIndex(g.meta, gapRow, 5))
    expect(route.cost).toBeGreaterThan(7 * flatSide) // longer than the straight line it can't take
    checkRoute(g, blocked, route.cells, route.cost)
  })

  it('walled in: no path in, and no path out', () => {
    const ring: [number, number][] = []
    for (let i = 3; i <= 7; i++) ring.push([3, i], [7, i], [i, 3], [i, 7])
    const g = makeGrid(11, 11, ring)
    const blocked = blockedMask(g, LIMIT)
    const inside = cellIndex(g.meta, 5, 5)
    const outside = cellIndex(g.meta, 0, 0)
    expect(findRoute(g, blocked, model, outside, inside)).toEqual({ ok: false, cells: [], cost: Infinity })
    expect(findRoute(g, blocked, model, inside, outside).ok).toBe(false)
  })

  it('a raised slope limit opens the wall', () => {
    const ring: [number, number][] = []
    for (let i = 3; i <= 7; i++) ring.push([3, i], [7, i], [i, 3], [i, 7])
    const g = makeGrid(11, 11, ring)
    expect(findRoute(g, blockedMask(g, STEEP), model, cellIndex(g.meta, 0, 0), cellIndex(g.meta, 5, 5)).ok).toBe(true)
  })
})

describe('route time', () => {
  it('on the example tiny grid, walking uphill (east) takes longer than downhill (west)', async () => {
    const fromDisk: FetchFile = async (name) => new Response(await readFile(new URL(`tiny/${name}`, examples)))
    const tiny = await loadGrid(fromDisk)
    const blocked = blockedMask(tiny, LIMIT)
    const west = cellIndex(tiny.meta, 3, 0)
    const east = cellIndex(tiny.meta, 3, 7)
    const up = findRoute(tiny, blocked, model, west, east)
    const down = findRoute(tiny, blocked, model, east, west)
    expect(up.cost).toBeGreaterThan(down.cost)
    checkRoute(tiny, blocked, up.cells, up.cost)
  })

  it('a route from a cell to itself is that cell, in 0 s', () => {
    const g = makeGrid(4, 4)
    expect(findRoute(g, blockedMask(g, LIMIT), model, 5, 5)).toEqual({ ok: true, cells: [5], cost: 0 })
  })

  it('matches a brute-force search on hilly ground with walls', () => {
    // Deterministic pseudo-random terrain.
    let seed = 7
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
    const walls: [number, number][] = []
    for (let r = 0; r < 9; r++) for (let c = 0; c < 12; c++) if (rand() < 0.2) walls.push([r, c])
    const g = makeGrid(12, 9, walls, () => rand() * 6)
    const blocked = blockedMask(g, LIMIT)
    const source = 0
    g.slope[source] = 0
    const { cost: timeS } = search(g, blocked, model, source)

    // Bellman-Ford: relax every edge until nothing changes.
    const best = new Float64Array(g.dem.length).fill(Infinity)
    best[source] = 0
    for (let changed = true; changed; ) {
      changed = false
      for (let u = 0; u < best.length; u++) {
        if (best[u] === Infinity) continue
        for (let k = 0; k < 8; k++) {
          const v = neighbourIndex(g.meta, Math.floor(u / 12), u % 12, k)
          if (v < 0) continue
          const t = best[u] + stepTimeS(g, blocked, model, u, v, 20 * NEIGHBOURS[k].flatFactor)
          if (t < best[v] - 1e-9) {
            best[v] = t
            changed = true
          }
        }
      }
    }
    for (let i = 0; i < best.length; i++) {
      if (best[i] === Infinity) expect(timeS[i]).toBe(Infinity)
      else expect(timeS[i]).toBeCloseTo(best[i], 9)
    }
  })
})

describe('reverse search (for the walk-home field)', () => {
  it('gives the time to walk TO the source, which differs from walking away on a slope', () => {
    const g = makeGrid(8, 6, [], (_r, c) => 2 * c) // rises to the east, like the tiny grid
    const blocked = blockedMask(g, LIMIT)
    const base = cellIndex(g.meta, 3, 0)
    const home = search(g, blocked, model, base, { reverse: true })
    for (const cell of [cellIndex(g.meta, 0, 7), cellIndex(g.meta, 5, 4), cellIndex(g.meta, 3, 1)]) {
      expect(home.cost[cell]).toBeCloseTo(findRoute(g, blocked, model, cell, base).cost, 9)
    }
    const far = cellIndex(g.meta, 3, 7)
    expect(home.cost[far]).toBeLessThan(findRoute(g, blocked, model, base, far).cost) // home is downhill
  })
})

describe('speed', () => {
  it('fills a full-size 400 x 300 grid well inside a second', () => {
    let seed = 11
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
    const g = makeGrid(400, 300, [], (r, c) => 40 * Math.sin(r / 25) * Math.cos(c / 30) + rand())
    for (let i = 0; i < g.slope.length; i++) g.slope[i] = rand() * 20 // about a quarter over the limit
    const blocked = blockedMask(g, LIMIT)
    const t0 = performance.now()
    search(g, blocked, model, cellIndex(g.meta, 150, 200))
    const ms = performance.now() - t0
    console.log(`full search, 120,000 cells: ${ms.toFixed(0)} ms`)
    expect(ms).toBeLessThan(1000)
  })
})
