import { describe, expect, it } from 'vitest'
import { ROCK_ABUNDANCE_K, ROCK_MAX_D_M, ROCK_MIN_D_M, ROCK_Q0, ROCK_Q1 } from './constants'
import { cellSeed, mulberry32, rocksForCell, rockSizes } from './rocks'

const sizes = rockSizes(ROCK_ABUNDANCE_K, ROCK_Q0, ROCK_Q1, ROCK_MIN_D_M, ROCK_MAX_D_M)
const opts = { worldSeed: 7, variants: 4, squashMin: 0.4, squashMax: 0.8 }

describe('rocks', () => {
  it('are the same every time for the same cell and seed', () => {
    expect(rocksForCell(120, 87, 400, sizes, opts)).toEqual(rocksForCell(120, 87, 400, sizes, opts))
    const a = mulberry32(42)
    const b = mulberry32(42)
    for (let i = 0; i < 5; i++) expect(a()).toBe(b())
  })

  it('differ between cells and between seeds', () => {
    expect(rocksForCell(120, 87, 400, sizes, opts)).not.toEqual(rocksForCell(120, 88, 400, sizes, opts))
    expect(rocksForCell(120, 87, 400, sizes, opts)).not.toEqual(rocksForCell(120, 87, 400, sizes, { ...opts, worldSeed: 8 }))
    expect(cellSeed(1, 2, 3)).not.toBe(cellSeed(2, 1, 3))
  })

  it('stay inside the cell and inside the size range, smaller far more common than larger', () => {
    const all = Array.from({ length: 40 }, (_, i) => rocksForCell(i, i * 3, 400, sizes, opts)).flat()
    expect(all.length).toBeGreaterThan(100)
    for (const r of all) {
      expect(Math.abs(r.u)).toBeLessThanOrEqual(0.5)
      expect(Math.abs(r.v)).toBeLessThanOrEqual(0.5)
      expect(r.d).toBeGreaterThanOrEqual(ROCK_MIN_D_M)
      expect(r.d).toBeLessThanOrEqual(ROCK_MAX_D_M)
      expect(r.variant).toBeLessThan(4)
    }
    const small = all.filter((r) => r.d < 0.3).length
    const big = all.filter((r) => r.d > 0.6).length
    expect(small).toBeGreaterThan(5 * big)
  })

  it('average the expected count from the curve', () => {
    const cells = 300
    let n = 0
    for (let i = 0; i < cells; i++) n += rocksForCell(i, 1000 - i, 400, sizes, opts).length
    expect(n / cells).toBeGreaterThan(0.85 * sizes.perM2 * 400)
    expect(n / cells).toBeLessThan(1.15 * sizes.perM2 * 400)
  })

  it('cover the stated fraction of ground in the drawn size range', () => {
    // Area of rocks drawn per m² must equal F(dMin) - F(dMax) of the abundance model.
    const q = ROCK_Q0 + ROCK_Q1 / ROCK_ABUNDANCE_K
    const expected = ROCK_ABUNDANCE_K * (Math.exp(-q * ROCK_MIN_D_M) - Math.exp(-q * ROCK_MAX_D_M))
    let area = 0
    const N = 20000
    for (let i = 0; i < N; i++) {
      const d = sizes.diameter((i + 0.5) / N)
      area += (Math.PI * d * d) / 4
    }
    expect((area / N) * sizes.perM2).toBeCloseTo(expected, 3)
  })
})
