import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { assumptionValue, parseAssumptions, type Station } from '../state/data'
import { speedModelFromAssumptions } from './cost'
import { cellIndex, cellToLatLon, latLonToCell, type Grid } from './grid'
import { formatDuration, planWalk, walkHomeTimes, type PlanParams } from './plan'

const examples = new URL('../../../examples/data/', import.meta.url)
const assumptions = parseAssumptions(JSON.parse(await readFile(new URL('jezero/assumptions.json', examples), 'utf-8')))
const A = (key: string) => assumptionValue(assumptions, key)
const model = speedModelFromAssumptions(assumptions)
const flatSide = 20 / model.vmaxMs

/** One-row-high strip of flat cells, 20 m each, with optional walls and heights. */
function makeGrid(width: number, height: number, walls: [number, number][] = [], dem: (r: number, c: number) => number = () => 0): Grid {
  const meta = { width, height, resM: 20, bounds: [18.4, 77.4, 18.41, 77.41] as [number, number, number, number], nodata: -9999, dem: 'dem.bin', slope: 'slope.bin' }
  const d = new Float32Array(width * height)
  const s = new Float32Array(width * height)
  for (let r = 0; r < height; r++) for (let c = 0; c < width; c++) d[r * width + c] = dem(r, c)
  for (const [r, c] of walls) s[r * width + c] = 30
  return { meta, dem: d, slope: s }
}

const station = (g: Grid, id: string, row: number, col: number, dwellS: number): Station => ({
  id,
  name: id === 'B' ? 'Base' : `Station ${id}`,
  ...cellToLatLon(g.meta, row, col),
  task: '',
  dwellS,
  sol: null,
  photos: [],
})

const params = (timeLimitS: number, carriedKg = 0): PlanParams => ({ slopeLimitDeg: A('slope_limit_plan_deg'), carriedKg, timeLimitS })

describe('planWalk on a flat out-and-back', () => {
  const g = makeGrid(40, 3)
  const stations = [station(g, 'B', 1, 0, 0), station(g, 'S1', 1, 39, 1200)]
  const oneWay = 39 * flatSide
  const total = 2 * oneWay + 1200

  it('has one leg out and one leg home, with totals that add up', () => {
    const r = planWalk(g, assumptions, stations, params(A('eva_time_limit_s')))
    expect(r.legs.map((l) => `${l.fromId}->${l.toId}`)).toEqual(['B->S1', 'S1->B'])
    expect(r.ok).toBe(true)
    expect(r.legs[0].distanceM).toBeCloseTo(39 * 20, 6)
    expect(r.distanceM).toBeCloseTo(2 * 39 * 20, 6)
    expect(r.movingTimeS).toBeCloseTo(2 * oneWay, 6)
    expect(r.stationTimeS).toBe(1200)
    expect(r.totalTimeS).toBeCloseTo(total, 6)
    expect(r.spareS).toBeCloseTo(A('eva_time_limit_s') - total, 6)
  })

  it('computes energy and dose from assumptions.json', () => {
    const r = planWalk(g, assumptions, stations, params(A('eva_time_limit_s'), 20))
    const walkKJ = ((2 * oneWay) / 3600) * A('work_rate_walk_kj_h')
    const stationKJ = (1200 / 3600) * A('work_rate_station_kj_h')
    expect(r.energyKJ).toBeCloseTo(walkKJ + stationKJ, 6) // flat: no climb work
    expect(r.doseMSv).toBeCloseTo((total / 3600) * A('dose_rate_msv_h'), 9)
  })

  it('starts and ends each leg path at the stations themselves', () => {
    const r = planWalk(g, assumptions, stations, params(A('eva_time_limit_s')))
    const p = r.legs[0].path
    expect(p[0]).toEqual({ lat: stations[0].lat, lon: stations[0].lon })
    expect(p[p.length - 1]).toEqual({ lat: stations[1].lat, lon: stations[1].lon })
  })

  it('is GO with plenty of spare, CAUTION under the margin, NO-GO over the limit', () => {
    const go = planWalk(g, assumptions, stations, params(A('eva_time_limit_s')))
    expect(go.status).toBe('go')
    expect(go.reason).toMatch(/^Fits the 6 h 0 min limit with .* spare\.$/)

    const caution = planWalk(g, assumptions, stations, params(total + A('caution_spare_s') - 60))
    expect(caution.status).toBe('caution')
    expect(caution.reason).toMatch(/^Only .* spare, less than the 45 min safety margin\.$/)

    const nogo = planWalk(g, assumptions, stations, params(total - 600))
    expect(nogo.status).toBe('nogo')
    expect(nogo.ok).toBe(true) // every leg has a path; it's just too long
    expect(nogo.spareS).toBeLessThan(0)
    expect(nogo.reason).toMatch(/, 10 min over the .* limit\.$/)
  })

  it('has no turn-back point when every point fits', () => {
    expect(planWalk(g, assumptions, stations, params(A('eva_time_limit_s'))).turnBack).toBeNull()
  })

  it('turns back at the station, before its work, when the work would not leave time to get home', () => {
    // Arrival fits (oneWay + oneWay + reserve), departure after 1200 s of work does not.
    const limit = 2 * oneWay + A('turnback_reserve_s') + 600
    const r = planWalk(g, assumptions, stations, params(limit))
    expect(r.turnBack?.position).toEqual({ lat: stations[1].lat, lon: stations[1].lon })
    expect(r.turnBack?.elapsedS).toBeCloseTo(oneWay, 6)
  })

  it('turns back on the way out when the limit is tight', () => {
    const limit = 3000 // fits while elapsed + elapsed + 1800 <= 3000, so up to 600 s out
    const r = planWalk(g, assumptions, stations, params(limit))
    const lastCol = Math.floor((limit - A('turnback_reserve_s')) / 2 / flatSide)
    expect(r.turnBack?.elapsedS).toBeCloseTo(lastCol * flatSide, 6)
    expect(r.turnBack?.distanceAlongM).toBeCloseTo(lastCol * 20, 6)
    expect(latLonToCell(g.meta, r.turnBack!.position)).toEqual({ row: 1, col: lastCol })
  })
})

describe('planWalk on slopes', () => {
  it('counts climb only uphill, adds climb work with carried mass, and the uphill leg is slower', () => {
    const g = makeGrid(20, 3, [], (_r, c) => c) // 1 m per cell, rising east
    const stations = [station({ ...g }, 'B', 1, 0, 0), station(g, 'S1', 1, 19, 0)]
    const r = planWalk(g, assumptions, stations, params(A('eva_time_limit_s'), 40))
    const [out, back] = r.legs
    expect(out.climbM).toBeCloseTo(19, 6)
    expect(back.climbM).toBe(0)
    expect(out.timeS).toBeGreaterThan(back.timeS)
    expect(out.distanceM).toBeCloseTo(19 * Math.hypot(20, 1), 6) // 3D length
    const liftKJ = ((A('suited_mass_kg') + 40) * A('mars_gravity_ms2') * 19) / 1000
    expect(out.energyKJ).toBeCloseTo((out.timeS / 3600) * A('work_rate_walk_kj_h') + liftKJ, 6)
  })
})

describe('planWalk with a leg that cannot be walked', () => {
  const ring: [number, number][] = []
  for (let i = 3; i <= 7; i++) ring.push([3, i], [7, i], [i, 3], [i, 7])
  const g = makeGrid(20, 11, ring)
  const stations = [station(g, 'B', 5, 15, 0), station(g, 'S1', 5, 19, 600), station(g, 'S2', 5, 5, 600), station(g, 'S3', 0, 15, 600)]

  it('is NO-GO, names the leg, and carries Infinity instead of a fake number', () => {
    const r = planWalk(g, assumptions, stations, params(A('eva_time_limit_s')))
    expect(r.ok).toBe(false)
    expect(r.status).toBe('nogo')
    expect(r.reason).toBe('No route from S1 to S2 under 15°.')
    const bad = r.legs[1]
    expect(bad).toMatchObject({ fromId: 'S1', toId: 'S2', ok: false, distanceM: Infinity, timeS: Infinity, path: [] })
    expect(r.legs[0]).toMatchObject({ ok: true, distanceM: 4 * 20 }) // working legs keep real numbers
    expect(r.legs[0].timeS).toBeCloseTo(4 * flatSide, 6)
    expect(r.totalTimeS).toBe(Infinity)
    expect(r.spareS).toBe(-Infinity)
    expect(r.doseMSv).toBe(Infinity)
  })

  it('has no turn-back point', () => {
    expect(planWalk(g, assumptions, stations, params(A('eva_time_limit_s'))).turnBack).toBeNull()
  })

  it('says so when a station is off the map', () => {
    const off = { ...stations[1], lat: 0, lon: 0 }
    const r = planWalk(g, assumptions, [stations[0], off], params(A('eva_time_limit_s')))
    expect(r.status).toBe('nogo')
    expect(r.reason).toBe('No route from B to S1: S1 is outside the map.')
  })

  it('needs at least one station besides base', () => {
    expect(() => planWalk(g, assumptions, [stations[0]], params(A('eva_time_limit_s')))).toThrow('at least one station')
  })
})

describe('walk-home times', () => {
  it('is 0 at base, Infinity inside a wall ring, and walking time elsewhere', () => {
    const ring: [number, number][] = []
    for (let i = 3; i <= 7; i++) ring.push([3, i], [7, i], [i, 3], [i, 7])
    const g = makeGrid(20, 11, ring)
    const home = walkHomeTimes(g, assumptions, cellToLatLon(g.meta, 5, 15), params(A('eva_time_limit_s')))
    expect(home[cellIndex(g.meta, 5, 15)]).toBe(0)
    expect(home[cellIndex(g.meta, 5, 5)]).toBe(Infinity)
    expect(home[cellIndex(g.meta, 5, 19)]).toBeCloseTo(4 * flatSide, 6)
  })
})

describe('formatDuration', () => {
  it('rounds to the minute', () => {
    expect(formatDuration(21600)).toBe('6 h 0 min')
    expect(formatDuration(2700)).toBe('45 min')
    expect(formatDuration(-629)).toBe('10 min')
    expect(formatDuration(3599)).toBe('1 h 0 min')
  })
})
