import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parseAssumptions, assumptionValue } from '../state/data'
import { bearingDeg, destination, distanceM } from './mars'

// The radius comes from the example assumptions file, never typed into code.
const assumptions = parseAssumptions(
  JSON.parse(readFileSync(new URL('../../../examples/data/jezero/assumptions.json', import.meta.url), 'utf-8')),
)
const R = assumptionValue(assumptions, 'mars_radius_m')

describe('distanceM', () => {
  it('18.0 N to 19.0 N on one longitude is about 59.3 km (brief, task 3)', () => {
    const d = distanceM({ lat: 18, lon: 77.45 }, { lat: 19, lon: 77.45 }, R)
    expect(d / 1000).toBeCloseTo(59.27, 1)
  })

  it('is zero for the same point and the same in both directions', () => {
    const a = { lat: 18.4446, lon: 77.4509 }
    const b = { lat: 18.45, lon: 77.405 }
    expect(distanceM(a, a, R)).toBe(0)
    expect(distanceM(a, b, R)).toBeCloseTo(distanceM(b, a, R), 6)
  })

  it('shrinks east-west distance by cos(latitude)', () => {
    const atEquator = distanceM({ lat: 0, lon: 77 }, { lat: 0, lon: 77.01 }, R)
    const at60 = distanceM({ lat: 60, lon: 77 }, { lat: 60, lon: 77.01 }, R)
    expect(at60 / atEquator).toBeCloseTo(0.5, 3)
  })
})

describe('bearingDeg', () => {
  const o = { lat: 18.4446, lon: 77.4509 }
  it('gives the four compass points, clockwise from north', () => {
    expect(bearingDeg(o, { lat: 18.5, lon: o.lon })).toBeCloseTo(0, 6)
    expect(bearingDeg(o, { lat: o.lat, lon: 77.5 })).toBeCloseTo(90, 1)
    expect(bearingDeg(o, { lat: 18.4, lon: o.lon })).toBeCloseTo(180, 6)
    expect(bearingDeg(o, { lat: o.lat, lon: 77.4 })).toBeCloseTo(270, 1)
  })

  it('stays within 0 to 360', () => {
    const b = bearingDeg(o, { lat: 18.5, lon: 77.4 }) // north-west
    expect(b).toBeGreaterThan(270)
    expect(b).toBeLessThan(360)
  })
})

describe('destination', () => {
  const o = { lat: 18.4446, lon: 77.4509 }
  it('lands the given distance away on the given bearing', () => {
    for (const b of [0, 45, 90, 180, 271.5]) {
      const p = destination(o, b, 1234, R)
      expect(distanceM(o, p, R)).toBeCloseTo(1234, 6)
      expect(bearingDeg(o, p)).toBeCloseTo(b % 360, 6)
    }
  })
})
