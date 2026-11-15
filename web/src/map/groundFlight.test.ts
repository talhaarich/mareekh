import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { distanceM } from '../lib/mars'
import { assumptionValue, parseAssumptions } from '../state/data'
import { flightAt, planFlight, type Eye, type FlightOptions, type Look } from './groundFlight'

const assumptions = parseAssumptions(
  JSON.parse(await readFile(new URL('../../../examples/data/jezero/assumptions.json', import.meta.url), 'utf-8')),
)
const R = assumptionValue(assumptions, 'mars_radius_m')

const FLOOR = -2560
const EYE = 40
const flat = () => FLOOR
// A 160 m ridge across the line, about 50 m wide, half way between start and end.
const ridge = (p: { lat: number; lon: number }) => (Math.abs(p.lon - 77.445) < 0.0005 ? FLOOR + 160 : FLOOR)

const opts = (heightAt: FlightOptions['heightAt']): FlightOptions => ({
  heightAt,
  distanceM: (a, b) => distanceM(a, b, R),
  clearanceM: 60,
  stepM: 10,
  cruisePitchDeg: 70,
})
const start: Eye = { lat: 18.45, lon: 77.43, altM: FLOOR + EYE }
const end: Eye = { lat: 18.45, lon: 77.46, altM: FLOOR + EYE }
const startLook: Look = { bearingDeg: 0, pitchDeg: 85 }
const endLook: Look = { bearingDeg: 270, pitchDeg: 85 }
const steps = Array.from({ length: 501 }, (_, i) => i / 500)

describe('ground-view flight path', () => {
  it('on flat ground: starts and ends exactly, cruises 60 m up, never below the eye height', () => {
    const plan = planFlight(start, startLook, end, endLook, opts(flat))
    expect(plan.cruiseAltM).toBe(FLOOR + 60)
    expect(flightAt(plan, 0)).toEqual({ ...start, ...startLook })
    expect(flightAt(plan, 1)).toEqual({ ...end, ...endLook })
    for (const t of steps) expect(flightAt(plan, t).altM).toBeGreaterThanOrEqual(FLOOR + EYE - 1e-9)
  })

  it('climbs over a ridge on the line and descends only at the end', () => {
    const plan = planFlight(start, startLook, end, endLook, opts(ridge))
    expect(plan.maxGroundM).toBe(FLOOR + 160)
    expect(plan.cruiseAltM).toBe(FLOOR + 220)
    let lowestOverGroundM = Infinity
    for (const t of steps) {
      const p = flightAt(plan, t)
      const clearance = p.altM - ridge(p)
      lowestOverGroundM = Math.min(lowestOverGroundM, clearance)
      // Anywhere away from the start and end columns, at least 60 m above the highest ground on the line.
      const onStartColumn = p.lon === start.lon
      const onEndColumn = p.lon === end.lon
      if (!onStartColumn && !onEndColumn) expect(p.altM).toBeGreaterThanOrEqual(plan.cruiseAltM - 1e-9)
      if (t > plan.climbEnd && t < plan.descentStart) expect(p.altM).toBeGreaterThanOrEqual(FLOOR + 160 + 60 - 1e-9)
      if (t < plan.descentStart) expect(p.altM).toBeGreaterThanOrEqual(t === 0 ? start.altM : start.altM - 1e-9)
    }
    expect(lowestOverGroundM).toBeCloseTo(EYE, 9) // the eye height, at the very start and end only
    // The descent is the last part only: the camera is over the end point before it goes down.
    const atDescent = flightAt(plan, plan.descentStart)
    expect(atDescent.lon).toBeCloseTo(end.lon, 12)
    expect(atDescent.altM).toBeCloseTo(plan.cruiseAltM, 9)
    expect(plan.descentStart).toBeGreaterThanOrEqual(0.6)
  })

  it('from high above, crosses at or above its start height down to the cruise height', () => {
    const high: Eye = { ...start, altM: FLOOR + 5000 }
    const plan = planFlight(high, { bearingDeg: 0, pitchDeg: 0 }, end, endLook, opts(ridge))
    expect(plan.climbEnd).toBe(0)
    for (const t of steps) expect(flightAt(plan, t).altM).toBeGreaterThanOrEqual(FLOOR + EYE - 1e-9)
    for (const t of steps.filter((s) => s < plan.descentStart)) {
      expect(flightAt(plan, t).altM).toBeGreaterThanOrEqual(plan.cruiseAltM - 1e-9)
    }
  })

  it('start equals end: no crossing, only the height and view change', () => {
    const lower = { ...start, altM: FLOOR + 20 }
    const plan = planFlight(start, startLook, lower, endLook, opts(flat))
    expect(plan.samePlace).toBe(true)
    for (const t of steps) {
      const p = flightAt(plan, t)
      expect(Number.isFinite(p.altM) && Number.isFinite(p.bearingDeg) && Number.isFinite(p.pitchDeg)).toBe(true)
      expect(p.lat).toBe(start.lat)
      expect(p.lon).toBe(start.lon)
      expect(p.altM).toBeGreaterThanOrEqual(FLOOR + 20 - 1e-9)
      expect(p.altM).toBeLessThanOrEqual(FLOOR + EYE + 1e-9)
    }
    expect(flightAt(plan, 1)).toEqual({ ...lower, ...endLook })
    // Turns the short way: 0° to 270° goes through 315°, not 135°.
    expect(flightAt(plan, 0.5).bearingDeg).toBeCloseTo(315, 6)
  })

  it('ignores points with no height and still ends on the eye point', () => {
    const plan = planFlight(start, startLook, end, endLook, opts(() => null))
    expect(plan.maxGroundM).toBe(-Infinity)
    expect(plan.cruiseAltM).toBe(end.altM)
    expect(flightAt(plan, 1)).toEqual({ ...end, ...endLook })
  })
})
