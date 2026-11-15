import { describe, expect, it } from 'vitest'
import { boxBlur, colourMapRGBA, normalMapRGBA, percentiles, photoFields, rockDensityFactor, sampleField, stretch } from './photo'

const W = 40
const H = 30
const field = (f: (x: number, y: number) => number) => {
  const a = new Float32Array(W * H)
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) a[y * W + x] = f(x, y)
  return a
}

describe('photo fields', () => {
  it('blur keeps a flat picture flat and averages a checkerboard', () => {
    expect([...boxBlur(field(() => 0.4), W, H, 3)].every((v) => Math.abs(v - 0.4) < 1e-6)).toBe(true)
    const check = boxBlur(field((x, y) => (x + y) % 2), W, H, 2)
    expect(check[15 * W + 20]).toBeCloseTo(13 / 25, 6) // 5 x 5 window centred on a 1
  })

  it('high-pass removes a smooth brightness slope but keeps a bright spot', () => {
    const ramp = photoFields(field((x) => x / W), W, H, 3, 5)
    expect(Math.abs(ramp.highPass[15 * W + 20])).toBeLessThan(1e-6) // interior of a linear ramp
    const spot = photoFields(field((x, y) => (x === 20 && y === 15 ? 1 : 0.3)), W, H, 3, 5)
    expect(spot.highPass[15 * W + 20]).toBeGreaterThan(0.5)
  })

  it('normal map: flat is straight up; a bright ridge tilts away on each side', () => {
    const flat = normalMapRGBA(new Float32Array(W * H), W, H, 10)
    expect([flat[0], flat[1], flat[2], flat[3]]).toEqual([128, 128, 255, 255])
    // Bright north-south ridge at column 20: east of it the "ground" falls east, so the normal leans east (x > 128).
    const ridge = field((x) => Math.max(0, 1 - Math.abs(x - 20) / 3))
    const n = normalMapRGBA(ridge, W, H, 10)
    const px = (x: number, y: number) => ((H - 1 - y) * W + x) * 4 // rows stored bottom first
    expect(n[px(22, 10)]).toBeGreaterThan(128)
    expect(n[px(18, 10)]).toBeLessThan(128)
    expect(n[px(22, 10) + 1]).toBe(128) // no north-south slope along the ridge
  })

  it('samples by picture coordinates, v = 1 at the north edge', () => {
    const f = field((_x, y) => y)
    expect(sampleField(f, W, H, 0.5, 1)).toBe(0) // north edge = row 0
    expect(sampleField(f, W, H, 0.5, 0)).toBe(H - 1)
  })
})

describe('stretch and colour', () => {
  it('finds the 2nd and 98th percentiles and stretches them to 0 and 1', () => {
    const lum = new Float32Array(1000).map((_, i) => 0.2 + 0.4 * (i / 999)) // 0.2 to 0.6, evenly
    const [lo, hi] = percentiles(lum, 0.02, 0.98)
    expect(lo).toBeCloseTo(0.208, 2)
    expect(hi).toBeCloseTo(0.592, 2)
    const s = stretch(lum, 0.02, 0.98)
    expect(s[0]).toBe(0) // below the 2nd percentile: clamped
    expect(s[999]).toBe(1)
    expect(s[500]).toBeCloseTo(0.5, 1)
  })

  it('colours as regolith x (0.7 + 0.6 x value), rows bottom first', () => {
    const v = new Float32Array([0, 1, 0.5, 0.5]) // 2 x 2, top row first
    const c = colourMapRGBA(v, 2, 2, [180, 140, 100], 0.7, 0.6)
    // Bottom row of the picture (0.5, 0.5) comes first.
    expect([c[0], c[1], c[2], c[3]]).toEqual([180, 140, 100, 255])
    // Top-left (value 0): 0.7 x; top-right (value 1): 1.3 x, clamped at 255.
    expect([c[8], c[9], c[10]]).toEqual([126, 98, 70])
    expect([c[12], c[13], c[14]]).toEqual([234, 182, 130])
  })
})

describe('rock density from the photo', () => {
  it('follows local contrast, never below the floor, averaging about 1', () => {
    expect(rockDensityFactor(0, 1, 0.3, 2)).toBe(0.3) // smooth ground still has some rocks
    expect(rockDensityFactor(1, 1, 0.3, 2)).toBeCloseTo(1, 12) // average contrast: the curve's count
    expect(rockDensityFactor(2, 1, 0.3, 2)).toBeCloseTo(1.7, 12)
    expect(rockDensityFactor(10, 1, 0.3, 2)).toBe(2)
  })
})
