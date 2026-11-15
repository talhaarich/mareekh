import { readFile } from 'node:fs/promises'
import { LngLat } from 'maplibre-gl'
import { describe, expect, it } from 'vitest'
import { assumptionValue, parseAssumptions } from '../state/data'
import { EARTH_RADIUS_M, exaggerationLabel, trueScaleFactor } from './trueScale'

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


  it('labels the exaggeration relative to true scale', () => {
    const f = trueScaleFactor(marsR)
    expect(exaggerationLabel(f, f)).toBe('1× (true scale)')
    expect(exaggerationLabel(2.5, f)).toBe('1.3×')
    expect(exaggerationLabel(1, f)).toBe('0.5×')
    expect(exaggerationLabel(10, f)).toBe('5.3×')
  })
})

