import { describe, expect, it } from 'vitest'
import {
  DASH,
  fmtAssumption,
  fmtDistance,
  fmtDuration,
  fmtLatLon,
  fmtPressureMbar,
  fmtSignedDuration,
  fmtTau,
  fmtTempC,
} from './format'

describe('format', () => {
  it('shows kelvin as Celsius with one decimal and a true minus sign', () => {
    expect(fmtTempC(217.47)).toBe('−55.7 °C')
    expect(fmtTempC(273.15)).toBe('0.0 °C')
    expect(fmtTempC(300)).toBe('26.9 °C')
  })

  it('shows pascals as millibar (divide by 100)', () => {
    expect(fmtPressureMbar(759.08)).toBe('7.59 mbar')
    expect(fmtPressureMbar(0)).toBe('0.00 mbar')
  })

  it('shows tau with two decimals and no unit', () => {
    expect(fmtTau(0.4)).toBe('0.40')
  })

  it('shows assumption values with their unit, seconds as a duration', () => {
    expect(fmtAssumption(21600, 's')).toBe('6 h 0 min')
    expect(fmtAssumption(600, 'kJ/h')).toBe('600 kJ/h')
    expect(fmtAssumption(0.05, '')).toBe('0.05 (no unit)')
  })

  it('shows positions in degrees with hemispheres', () => {
    expect(fmtLatLon(18.4446, 77.4509)).toBe('18.44460° N, 77.45090° E')
    expect(fmtLatLon(-1, -2)).toBe('1.00000° S, 2.00000° W')
  })

  it('shows a dash for anything not finite', () => {
    for (const f of [fmtTempC, fmtPressureMbar, fmtTau, fmtDistance, fmtDuration, fmtSignedDuration]) {
      expect(f(Infinity)).toBe(DASH)
      expect(f(NaN)).toBe(DASH)
    }
    expect(fmtLatLon(NaN, 1)).toBe(DASH)
  })
})
