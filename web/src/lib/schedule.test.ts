import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { assumptionValue, parseAssumptions, type Station } from '../state/data'
import { cellToLatLon, type Grid } from './grid'
import { planWalk } from './plan'
import { stationSchedule } from './schedule'
import { walkTimeline, type TimelinePoint } from './timeline'

const P = { lat: 0, lon: 0 }
const pt = (elapsedS: number, stationId: string | null): TimelinePoint => ({ position: P, elapsedS, distanceAlongM: 0, stationId })

describe('stationSchedule', () => {
  it('reads arrival and departure for each station visit, base at both ends', () => {
    const t = [pt(0, 'B'), pt(50, null), pt(100, 'S1'), pt(700, 'S1'), pt(750, null), pt(800, 'S2'), pt(860, null), pt(900, 'B')]
    expect(stationSchedule(t)).toEqual([
      { stationId: 'B', arriveS: 0, departS: 0 },
      { stationId: 'S1', arriveS: 100, departS: 700 },
      { stationId: 'S2', arriveS: 800, departS: 800 }, // no dwell
      { stationId: 'B', arriveS: 900, departS: 900 },
    ])
  })

  it('ends at the last station reached when the walk stops early, and is empty with no timeline', () => {
    expect(stationSchedule([pt(0, 'B'), pt(100, 'S1'), pt(400, 'S1')])).toEqual([
      { stationId: 'B', arriveS: 0, departS: 0 },
      { stationId: 'S1', arriveS: 100, departS: 400 },
    ])
    expect(stationSchedule([])).toEqual([])
  })

  it('matches the real planner: last arrival is the plan total, dwell is each station dwell', async () => {
    const examples = new URL('../../../examples/data/', import.meta.url)
    const assumptions = parseAssumptions(JSON.parse(await readFile(new URL('jezero/assumptions.json', examples), 'utf-8')))
    const meta = { width: 30, height: 10, resM: 20, bounds: [18.4, 77.4, 18.41, 77.41] as [number, number, number, number], nodata: -9999, dem: 'dem.bin', slope: 'slope.bin' }
    const g: Grid = { meta, dem: new Float32Array(300), slope: new Float32Array(300) }
    const st = (id: string, col: number, dwellS: number): Station => ({ id, name: id, ...cellToLatLon(meta, 5, col), task: '', dwellS, sol: null, photos: [] })
    const stations = [st('B', 1, 0), st('S1', 15, 1200), st('S2', 28, 600)]
    const params = { slopeLimitDeg: assumptionValue(assumptions, 'slope_limit_plan_deg'), carriedKg: 0, timeLimitS: 21600 }
    const result = planWalk(g, assumptions, stations, params)
    const s = stationSchedule(walkTimeline(g, assumptions, stations, result))

    expect(s.map((x) => x.stationId)).toEqual(['B', 'S1', 'S2', 'B'])
    expect(s[1].departS - s[1].arriveS).toBeCloseTo(1200, 6)
    expect(s[2].departS - s[2].arriveS).toBeCloseTo(600, 6)
    expect(s[1].arriveS).toBeCloseTo(result.legs[0].timeS, 6)
    expect(s[3].arriveS).toBeCloseTo(result.totalTimeS, 6)
  })
})
