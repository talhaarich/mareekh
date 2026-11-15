import { readFile } from 'node:fs/promises'
import { beforeEach, describe, expect, it } from 'vitest'
import { cellToLatLon as cellCentre, loadGrid, type FetchFile, type Grid } from '../lib/grid'
import * as helpers from '../lib/helpers'
import { planWalk } from '../lib/plan'
import { assumptionValue, parseAssumptions, useData, type Station } from './data'
import { usePlan } from './plan'
import { selectFixPrompt, selectNextStop, selectTimeLeftS, usePosition } from './position'

const examples = new URL('../../../examples/data/', import.meta.url)
const assumptions = parseAssumptions(JSON.parse(await readFile(new URL('jezero/assumptions.json', examples), 'utf-8')))
const drift = assumptionValue(assumptions, 'drift_fraction')
const vmax = assumptionValue(assumptions, 'walk_speed_long_ms')

// Flat 11 x 3 strip: base at the west end, S1 at the east end, 200 m apart.
// Bounds sized so the cells really are 20 m on Mars: 3 x 20 m north-south, 11 x 20 m east-west.
const meta = { width: 11, height: 3, resM: 20, bounds: [18.4, 77.4, 18.4010122, 77.4039115] as [number, number, number, number], nodata: -9999, dem: 'dem.bin', slope: 'slope.bin' }
const grid: Grid = { meta, dem: new Float32Array(33), slope: new Float32Array(33) }
const st = (id: string, col: number, dwellS: number): Station => ({ id, name: id, ...cellCentre(meta, 1, col), task: '', dwellS, sol: null, photos: [] })
const stations = [st('B', 0, 0), st('S1', 10, 600)]
const params = { slopeLimitDeg: 15, carriedKg: 0, timeLimitS: 21600 }
const legS = 200 / vmax

beforeEach(() => {
  useData.setState({ grid, assumptions, stations, loaded: true })
  usePlan.setState({ result: planWalk(grid, assumptions, stations, params), busy: false })
  usePosition.getState().reset()
})

describe('position', () => {
  it('moves onto base by itself when data finishes loading', () => {
    useData.setState({ loaded: false })
    usePosition.setState({ estimate: { lat: NaN, lon: NaN } })
    useData.setState({ loaded: true })
    expect(usePosition.getState().estimate).toEqual({ lat: stations[0].lat, lon: stations[0].lon })
  })

  it('starts at base with no uncertainty, labelled simulated', () => {
    expect(usePosition.getState()).toMatchObject({ estimate: { lat: stations[0].lat, lon: stations[0].lon }, uncertaintyM: 0, sinceFixM: 0, elapsedS: 0, simulated: true, fixes: [] })
  })

  it('moves along the route at modelled speed, uncertainty growing with distance', () => {
    usePosition.getState().simulateTo(legS / 2)
    const p = usePosition.getState()
    expect(p.sinceFixM).toBeCloseTo(100, 6)
    expect(p.uncertaintyM).toBeCloseTo(drift * 100, 9)
    expect(p.estimate.lon).toBeCloseTo((stations[0].lon + stations[1].lon) / 2, 9)
  })

  it('a fix snaps to the landmark, resets uncertainty, is logged, and drift restarts from there', () => {
    usePosition.getState().simulateTo(legS + 100) // working at S1
    expect(usePosition.getState().uncertaintyM).toBeCloseTo(drift * 200, 9)
    usePosition.getState().fixAt('S1')
    expect(usePosition.getState()).toMatchObject({ estimate: { lat: stations[1].lat, lon: stations[1].lon }, uncertaintyM: 0, sinceFixM: 0 })
    expect(usePosition.getState().fixes).toEqual([{ stationId: 'S1', elapsedS: legS + 100 }])
    usePosition.getState().simulateTo(legS + 600 + legS / 4) // 50 m into the walk home
    expect(usePosition.getState().sinceFixM).toBeCloseTo(50, 6)
    expect(usePosition.getState().uncertaintyM).toBeCloseTo(drift * 50, 9)
  })

  it('advance moves on by seconds and stops at base at the end', () => {
    usePosition.getState().advance(60)
    expect(usePosition.getState().elapsedS).toBe(60)
    usePosition.getState().advance(1e6)
    expect(usePosition.getState().elapsedS).toBeCloseTo(2 * legS + 600, 6)
    expect(usePosition.getState().estimate).toEqual({ lat: stations[0].lat, lon: stations[0].lon })
  })

  it('reset clears the walk and the fix log', () => {
    usePosition.getState().simulateTo(legS)
    usePosition.getState().fixAt('S1')
    usePosition.getState().reset()
    expect(usePosition.getState()).toMatchObject({ elapsedS: 0, uncertaintyM: 0, fixes: [] })
  })

  it('does nothing before there is a plan, and rejects an unknown landmark', () => {
    usePlan.setState({ result: null })
    usePosition.getState().simulateTo(100)
    expect(usePosition.getState().elapsedS).toBe(0)
    expect(() => usePosition.getState().fixAt('S9')).toThrow('No station "S9"')
  })
})

describe('fix prompt', () => {
  const prompt = () => selectFixPrompt(usePosition.getState())

  it('asks for a fix on reaching a station after drifting, and stops asking once fixed', () => {
    expect(prompt()).toBeNull() // at base, no drift yet
    usePosition.getState().simulateTo(legS / 2)
    expect(prompt()).toBeNull() // walking, not at a landmark
    usePosition.getState().simulateTo(legS)
    expect(prompt()).toBe('S1') // arrived
    usePosition.getState().simulateTo(legS + 300)
    expect(prompt()).toBe('S1') // still there, working
    usePosition.getState().fixAt('S1')
    expect(prompt()).toBeNull()
    usePosition.getState().simulateTo(1e6)
    expect(prompt()).toBe('B') // home again, drifted on the way back
  })
})

describe('next stop and time left', () => {
  const next = () => selectNextStop(usePosition.getState())

  it('names the next station along the walk, then base on the way home, then nothing', () => {
    expect(next()).toBe('S1') // at base, about to leave
    usePosition.getState().simulateTo(legS / 2)
    expect(next()).toBe('S1') // walking out
    usePosition.getState().simulateTo(legS)
    expect(next()).toBe('B') // arrived at S1: the stop after it is home
    usePosition.getState().simulateTo(legS + 300)
    expect(next()).toBe('B') // working at S1
    usePosition.getState().simulateTo(legS + 600 + legS / 2)
    expect(next()).toBe('B') // walking home
    usePosition.getState().simulateTo(1e6)
    expect(next()).toBeNull() // finished
  })

  it('counts the walk as finished a float hair before the timeline end', () => {
    usePosition.getState().simulateTo(2 * legS + 600 - 1e-6)
    expect(next()).toBeNull()
  })

  it('is null with no plan', () => {
    usePlan.setState({ result: null })
    expect(next()).toBeNull()
  })

  it('time left is the limit minus simulated elapsed time, and goes negative past the limit', () => {
    expect(selectTimeLeftS(usePosition.getState(), 21600)).toBe(21600)
    usePosition.getState().simulateTo(100)
    expect(selectTimeLeftS(usePosition.getState(), 21600)).toBeCloseTo(21500, 9)
    expect(selectTimeLeftS({ elapsedS: 400 }, 300)).toBe(-100)
  })
})

describe('interface helpers', () => {
  it('draw an uncertainty ring of the right size in Mars metres', () => {
    const ring = helpers.uncertaintyRing(stations[0], 75)!
    const coords = ring.geometry.coordinates[0]
    expect(coords[0]).toEqual(coords[coords.length - 1]) // closed
    for (const [lon, lat] of coords) expect(helpers.distanceM(stations[0], { lat, lon })).toBeCloseTo(75, 6)
    expect(helpers.uncertaintyRing(stations[0], 0)).toBeNull()
  })

  it('give range and bearing to base on Mars', () => {
    const north = { lat: 19, lon: stations[0].lon }
    expect(helpers.distanceM({ lat: 18, lon: 77.45 }, { lat: 19, lon: 77.45 }) / 1000).toBeCloseTo(59.27, 1)
    expect(helpers.bearingDeg(stations[0], north)).toBeCloseTo(0, 6)
    expect(helpers.distanceM(stations[0], stations[1])).toBeCloseTo(200, 0)
  })

  it('convert cells and sample the loaded grid', async () => {
    const fromDisk: FetchFile = async (name) => new Response(await readFile(new URL(`tiny/${name}`, examples)))
    useData.setState({ grid: await loadGrid(fromDisk) })
    expect(helpers.latLonToCell(helpers.cellToLatLon(5, 7))).toEqual({ row: 5, col: 7 })
    expect(helpers.sample(helpers.cellToLatLon(0, 3))?.heightM).toBe(6)
    expect(helpers.latLonToCell({ lat: 0, lon: 0 })).toBeNull()
  })

  it('find the nearest station in a straight line on Mars', () => {
    const near = (lon: number) => helpers.nearestStationId(stations, { lat: stations[0].lat, lon })
    expect(near(stations[0].lon + 0.0001)).toBe('B')
    expect(near(stations[1].lon - 0.0001)).toBe('S1')
    expect(helpers.nearestStationId([], stations[0])).toBeNull()
  })

  it('build route B params from a compare preset, changing one thing', () => {
    const plan = { slopeLimitDeg: 15, carriedKg: 10, timeLimitS: 21600 }
    expect(helpers.compareParams('off', plan)).toBeNull()
    expect(helpers.compareParams('steeper', plan)).toEqual({ ...plan, objective: 'time', slopeLimitDeg: assumptionValue(assumptions, 'slope_limit_hard_deg') })
    expect(helpers.compareParams('shortest', plan)).toEqual({ ...plan, objective: 'distance' })
  })

  it('throw a clear error before the grid has loaded', () => {
    useData.setState({ grid: null })
    expect(() => helpers.cellToLatLon(0, 0)).toThrow('Grid not loaded yet')
  })
})
