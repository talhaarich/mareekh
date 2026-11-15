import { readFile } from 'node:fs/promises'
import { LngLat } from 'maplibre-gl'
import { describe, expect, it } from 'vitest'
import { assumptionValue, parseAssumptions } from '../state/data'
import { cameraPosition, centerDistanceM, EARTH_RADIUS_M, exaggerationLabel, mapToMarsM, marsToMapM, trueScaleFactor } from './groundScale'

const assumptions = parseAssumptions(
  JSON.parse(await readFile(new URL('../../../examples/data/jezero/assumptions.json', import.meta.url), 'utf-8')),
)
const marsR = assumptionValue(assumptions, 'mars_radius_m')

describe('true vertical scale', () => {
  it('uses the same Earth radius as the installed MapLibre', () => {
    const oneDegreeM = new LngLat(0, 0).distanceTo(new LngLat(0, 1))
    expect(oneDegreeM).toBeCloseTo((EARTH_RADIUS_M * Math.PI) / 180, 3)
  })

  it('is R_earth / R_mars, about 1.876', () => {
    expect(trueScaleFactor(marsR)).toBeCloseTo(1.8759, 4)
  })

  it('converts Mars metres to MapLibre metres and back', () => {
    const f = trueScaleFactor(marsR)
    expect(marsToMapM(40, f)).toBeCloseTo(75.04, 2)
    expect(mapToMarsM(marsToMapM(-2560, f), f)).toBeCloseTo(-2560, 9)
  })

  it('labels the exaggeration relative to true scale', () => {
    const f = trueScaleFactor(marsR)
    expect(exaggerationLabel(f, f)).toBe('1× (true scale)')
    expect(exaggerationLabel(2.5, f)).toBe('1.3×')
    expect(exaggerationLabel(1, f)).toBe('0.5×')
    expect(exaggerationLabel(10, f)).toBe('5.3×')
  })
})

describe('camera position from the map view', () => {
  const view = { center: { lat: 18.45, lon: 77.43 }, zoom: 14, bearingDeg: 0, centerElevationM: -4800, fovDeg: 36.87, heightPx: 800 }
  // Camera to center distance in metres at zoom 14, latitude 18.45 (MapLibre: 512 px tiles).
  const distM = (400 / Math.tan((36.87 * Math.PI) / 360)) * ((2 * Math.PI * EARTH_RADIUS_M * Math.cos((18.45 * Math.PI) / 180)) / (512 * 2 ** 14))

  it('looking straight down: right above the center', () => {
    const c = cameraPosition({ ...view, pitchDeg: 0 })
    expect(c.lat).toBeCloseTo(18.45, 12)
    expect(c.lon).toBeCloseTo(77.43, 12)
    expect(c.altM).toBeCloseTo(-4800 + distM, 6)
  })

  it('tilted 60° facing east: behind the center to the west, by MapLibre’s own distance', () => {
    const c = cameraPosition({ ...view, pitchDeg: 60, bearingDeg: 90 })
    expect(c.lat).toBeCloseTo(18.45, 9)
    expect(c.lon).toBeLessThan(77.43)
    const ground = new LngLat(c.lon, c.lat).distanceTo(new LngLat(77.43, 18.45))
    expect(ground / (distM * Math.sin(Math.PI / 3))).toBeCloseTo(1, 4)
    expect(c.altM).toBeCloseTo(-4800 + distM * 0.5, 6)
  })
})

describe('center distance for a zoom', () => {
  it('is the distance MapLibre turns back into that zoom, halving with each zoom level', () => {
    const d = centerDistanceM(14, 18.45, 36.87, 800)
    expect(d).toBeCloseTo((400 / Math.tan((36.87 * Math.PI) / 360)) * ((2 * Math.PI * EARTH_RADIUS_M * Math.cos((18.45 * Math.PI) / 180)) / (512 * 2 ** 14)), 6)
    expect(centerDistanceM(15, 18.45, 36.87, 800)).toBeCloseTo(d / 2, 6)
    const straightDown = cameraPosition({ center: { lat: 18.45, lon: 77.43 }, zoom: 14, pitchDeg: 0, bearingDeg: 0, centerElevationM: 0, fovDeg: 36.87, heightPx: 800 })
    expect(straightDown.altM).toBeCloseTo(d, 6)
  })
})
