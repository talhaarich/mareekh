import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { assumptionValue, parseAssumptions, type Station } from '../state/data'
import { cellToLatLon, type Grid } from './grid'
import { planWalk } from './plan'
import { pointAt, walkTimeline } from './timeline'

const examples = new URL('../../../examples/data/', import.meta.url)
const assumptions = parseAssumptions(JSON.parse(await readFile(new URL('jezero/assumptions.json', examples), 'utf-8')))
const params = { slopeLimitDeg: assumptionValue(assumptions, 'slope_limit_plan_deg'), carriedKg: 0, timeLimitS: assumptionValue(assumptions, 'eva_time_limit_s') }

function makeGrid(width: number, height: number, walls: [number, number][] = [], dem: (r: number, c: number) => number = () => 0): Grid {
  const meta = { width, height, resM: 20, bounds: [18.4, 77.4, 18.41, 77.41] as [number, number, number, number], nodata: -9999, dem: 'dem.bin', slope: 'slope.bin' }
  const d = new Float32Array(width * height)
  const s = new Float32Array(width * height)
  for (let r = 0; r < height; r++) for (let c = 0; c < width; c++) d[r * width + c] = dem(r, c)
  for (const [r, c] of walls) s[r * width + c] = 30
  return { meta, dem: d, slope: s }
}
const st = (g: Grid, id: string, row: number, col: number, dwellS: number): Station => ({ id, name: id, ...cellToLatLon(g.meta, row, col), task: '', dwellS, sol: null, photos: [] })

describe('walkTimeline', () => {
  // Hilly ground with a wall, three stations: a realistic shape for the consistency check.
  let seed = 5
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
  const walls: [number, number][] = []
  for (let r = 2; r < 18; r++) walls.push([r, 12])
  const g = makeGrid(30, 20, walls, (r, c) => 3 * Math.sin(r / 3) + 2 * Math.cos(c / 4) + rand())
  const stations = [st(g, 'B', 10, 2, 0), st(g, 'S1', 4, 25, 1200), st(g, 'S2', 16, 22, 900)]
  const result = planWalk(g, assumptions, stations, params)
  const t = walkTimeline(g, assumptions, stations, result)

  it('ends at exactly the plan total time and walked distance', () => {
    expect(result.ok).toBe(true)
    const end = t[t.length - 1]
    expect(end.elapsedS).toBeCloseTo(result.totalTimeS, 6)
    expect(end.distanceAlongM).toBeCloseTo(result.distanceM, 6)
    expect(end.position).toEqual({ lat: stations[0].lat, lon: stations[0].lon })
  })

  it('starts at base and never goes back in time or distance', () => {
    expect(t[0]).toMatchObject({ elapsedS: 0, distanceAlongM: 0, stationId: 'B' })
    for (let i = 1; i < t.length; i++) {
      expect(t[i].elapsedS).toBeGreaterThanOrEqual(t[i - 1].elapsedS)
      expect(t[i].distanceAlongM).toBeGreaterThanOrEqual(t[i - 1].distanceAlongM)
    }
  })

  it('waits at each station for its dwell time', () => {
    const atS1 = t.filter((p) => p.stationId === 'S1')
    expect(atS1).toHaveLength(2)
    expect(atS1[1].elapsedS - atS1[0].elapsedS).toBe(1200)
    expect(atS1[1].position).toEqual(atS1[0].position)
    expect(atS1[0].elapsedS).toBeCloseTo(result.legs[0].timeS, 6)
  })

  it('stops at the last station it can reach on a NO-GO plan', () => {
    const ring: [number, number][] = []
    for (let i = 3; i <= 7; i++) ring.push([3, i], [7, i], [i, 3], [i, 7])
    const h = makeGrid(20, 11, ring)
    const s = [st(h, 'B', 5, 15, 0), st(h, 'S1', 5, 19, 600), st(h, 'S2', 5, 5, 600)]
    const tl = walkTimeline(h, assumptions, s, planWalk(h, assumptions, s, params))
    expect(tl[tl.length - 1]).toMatchObject({ stationId: 'S1', position: { lat: s[1].lat, lon: s[1].lon } })
  })
})

describe('pointAt', () => {
  const g = makeGrid(11, 3)
  const stations = [st(g, 'B', 1, 0, 0), st(g, 'S1', 1, 10, 600)]
  const result = planWalk(g, assumptions, stations, params)
  const t = walkTimeline(g, assumptions, stations, result)
  const leg = result.legs[0]

  it('is halfway along the first leg at half its time', () => {
    const p = pointAt(t, leg.timeS / 2)
    expect(p.distanceAlongM).toBeCloseTo(100, 6)
    expect(p.position.lon).toBeCloseTo((stations[0].lon + stations[1].lon) / 2, 9)
    expect(p.position.lat).toBeCloseTo(stations[0].lat, 9)
    expect(p.stationId).toBeNull()
  })

  it('stays at the station, named, while working there', () => {
    const p = pointAt(t, leg.timeS + 300)
    expect(p.position).toEqual({ lat: stations[1].lat, lon: stations[1].lon })
    expect(p.stationId).toBe('S1')
    expect(p.distanceAlongM).toBeCloseTo(200, 6)
  })

  it('clamps before the start and after the end', () => {
    expect(pointAt(t, -10)).toBe(t[0])
    expect(pointAt(t, 1e9)).toBe(t[t.length - 1])
  })
})
