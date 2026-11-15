import { describe, expect, it } from 'vitest'
import { distanceM, bearingDeg } from '../lib/mars'
import {
  ease,
  flyDurationMs,
  FLY_MS_MAX,
  FLY_MS_MIN,
  freeAreaOffset,
  STATION_PITCH_3D,
  STATION_ZOOM_2D,
  stationCamera,
  stepStop,
  walkOrder,
} from './stationFlight'

const R = 3396190 // mars_radius_m in assumptions.json
const dist = (a: { lat: number; lon: number }, b: { lat: number; lon: number }) => distanceM(a, b, R)

describe('walk order and stepping', () => {
  const legs = [
    { fromId: 'B', toId: 'S1' },
    { fromId: 'S1', toId: 'S3' },
    { fromId: 'S3', toId: 'S2' },
    { fromId: 'S2', toId: 'B' },
  ]
  it('follows the plan, base first, without repeating base', () => {
    expect(walkOrder(['B', 'S1', 'S2', 'S3'], legs)).toEqual(['B', 'S1', 'S3', 'S2'])
    expect(walkOrder(['B', 'S1', 'S2'], null)).toEqual(['B', 'S1', 'S2'])
  })
  it('steps forward and back, wrapping round', () => {
    const order = ['B', 'S1', 'S3', 'S2']
    expect(stepStop(order, 'S1', 1)).toBe('S3')
    expect(stepStop(order, 'S2', 1)).toBe('B')
    expect(stepStop(order, 'B', -1)).toBe('S2')
    expect(stepStop(order, 'S9', 1)).toBe('B') // not in the walk: start at base
    expect(stepStop([], 'B', 1)).toBeNull()
  })
})

describe('station camera', () => {
  const base = { lat: 18.4446, lon: 77.4509 }
  const s1 = { lat: 18.4534, lon: 77.4084 } // west-north-west of base
  const common = { currentZoom: 12, currentBearing: 30, distanceM: dist, bearingDeg }

  it('2D: straight down, keeps the bearing, zooms in to at least the station zoom', () => {
    const c = stationCamera({ ...common, to: s1, from: base, terrain3d: false })
    expect(c).toMatchObject({ center: [s1.lon, s1.lat], pitch: 0, bearing: 30, zoom: STATION_ZOOM_2D })
    expect(stationCamera({ ...common, currentZoom: 16, to: s1, from: base, terrain3d: false }).zoom).toBe(16)
  })

  it('3D: pitched, facing the way travelled', () => {
    const c = stationCamera({ ...common, to: s1, from: base, terrain3d: true })
    expect(c.pitch).toBe(STATION_PITCH_3D)
    expect(c.bearing).toBeCloseTo(bearingDeg(base, s1), 9)
    expect(c.bearing).toBeGreaterThan(270) // west-north-west
    // No "from", or the same place: keep the current bearing.
    expect(stationCamera({ ...common, to: s1, from: null, terrain3d: true }).bearing).toBe(30)
    expect(stationCamera({ ...common, to: s1, from: s1, terrain3d: true }).bearing).toBe(30)
  })

  it('flies longer for longer distances, within bounds', () => {
    expect(flyDurationMs(0)).toBe(FLY_MS_MIN)
    expect(flyDurationMs(2440)).toBeGreaterThan(flyDurationMs(200))
    expect(flyDurationMs(100000)).toBe(FLY_MS_MAX)
  })
})

describe('transition helpers', () => {
  it('ease runs from a to b, slow at both ends, clamped', () => {
    expect(ease(0.02, 2.5, 0)).toBe(0.02)
    expect(ease(0.02, 2.5, 1)).toBe(2.5)
    expect(ease(0, 1, 0.5)).toBeCloseTo(0.5, 12)
    expect(ease(0, 1, 0.1)).toBeLessThan(0.1)
    expect(ease(0, 1, 2)).toBe(1)
  })
  it('free-area offset centres the target between the panels', () => {
    expect(freeAreaOffset({ top: 60, right: 52, bottom: 0, left: 352 })).toEqual([150, 30])
    expect(freeAreaOffset({ top: 0, right: 0, bottom: 0, left: 0 })).toEqual([0, 0])
  })
})
