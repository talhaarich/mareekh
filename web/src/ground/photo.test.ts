import { describe, expect, it } from 'vitest'
import { boxBlur, normalMapRGBA, photoFields, rockDensityFactor, sampleField } from './photo'

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

describe('rock density from the photo', () => {
  it('is almost none on smooth dark ground, more on rough or bright ground', () => {
    const smoothDark = rockDensityFactor(0.3, 0.7, 1, 1)
    const average = rockDensityFactor(1, 1, 1, 1)
    const rough = rockDensityFactor(2, 1, 1, 1)
    const bright = rockDensityFactor(1, 1.4, 1, 1)
    expect(smoothDark).toBeLessThan(0.05)
    expect(average).toBeGreaterThan(smoothDark)
    expect(rough).toBeGreaterThan(average)
    expect(bright).toBeGreaterThan(average)
    expect(rockDensityFactor(9, 9, 1, 1)).toBeLessThanOrEqual(2)
  })
})
