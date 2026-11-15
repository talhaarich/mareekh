import { describe, expect, it } from 'vitest'
import { sunDirection } from './sun'

const LAT = 18.44 // Jezero, about (the scene uses the patch centre from the data)

describe('sun direction', () => {
  it('at noon (equinox) is due south, 90° minus the latitude high', () => {
    const s = sunDirection(12, LAT, 0)
    expect(s.azimuthDeg).toBeCloseTo(180, 9)
    expect(s.elevationDeg).toBeCloseTo(90 - LAT, 9)
  })

  it('rises due east at 06:00 and sets due west at 18:00 (equinox)', () => {
    const am = sunDirection(6, LAT, 0)
    expect(am.elevationDeg).toBeCloseTo(0, 9)
    expect(am.azimuthDeg).toBeCloseTo(90, 9)
    const pm = sunDirection(18, LAT, 0)
    expect(pm.elevationDeg).toBeCloseTo(0, 9)
    expect(pm.azimuthDeg).toBeCloseTo(270, 9)
  })

  it('is east of south in the morning, west in the afternoon, and a unit vector', () => {
    const am = sunDirection(9, LAT, 0)
    const pm = sunDirection(15, LAT, 0)
    expect(am.azimuthDeg).toBeGreaterThan(90)
    expect(am.azimuthDeg).toBeLessThan(180)
    expect(pm.azimuthDeg).toBeGreaterThan(180)
    expect(pm.elevationDeg).toBeCloseTo(am.elevationDeg, 9)
    expect(Math.hypot(am.east, am.north, am.up)).toBeCloseTo(1, 12)
  })

  it('with a northern declination (below the latitude), stands higher at noon', () => {
    expect(sunDirection(12, LAT, 10).elevationDeg).toBeCloseTo(90 - LAT + 10, 9)
  })
})
