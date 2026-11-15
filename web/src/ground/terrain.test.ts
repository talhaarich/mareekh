import { describe, expect, it } from 'vitest'
import type { Grid } from '../lib/grid'
import { cellToLatLon } from '../lib/grid'
import { NOISE_CLEAR_M, NOISE_MAX_M, NOISE_OCTAVES, NOISE_WAVELENGTH_M, WORLD_SEED } from './constants'
import { bicubicHeight, buildChunk, bumpNoise, gridMap, makeFrame, slopeAt, terrainHeight, toLatLon, toLocal } from './terrain'

const R = 3396190 // the Mars radius in assumptions.json (mars_radius_m)
const noise = { maxM: NOISE_MAX_M, wavelengthM: NOISE_WAVELENGTH_M, octaves: NOISE_OCTAVES, clearM: NOISE_CLEAR_M, seed: WORLD_SEED }

// 12 x 10 grid of 20 m cells on Mars (bounds sized so cells really are 20 m), heights a tilted wavy surface.
const W = 12
const H = 10
const dLat = (H * 20) / (R * (Math.PI / 180))
const dLon = (W * 20) / (R * (Math.PI / 180) * Math.cos(18.45 * (Math.PI / 180)))
const meta = { width: W, height: H, resM: 20, bounds: [18.45, 77.4, 18.45 + dLat, 77.4 + dLon] as [number, number, number, number], nodata: -9999, dem: 'dem.bin', slope: 'slope.bin' }
const dem = new Float32Array(W * H)
const slope = new Float32Array(W * H)
for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
  dem[r * W + c] = -2560 + 3.1 * c - 1.7 * r + 4 * Math.sin(c * 0.9) * Math.cos(r * 0.7)
  slope[r * W + c] = c
}
const grid: Grid = { meta, dem, slope }

describe('ground heights', () => {
  it('are exactly the grid height at every grid point', () => {
    for (let r = 0; r < H; r++) {
      for (let c = 0; c < W; c++) {
        expect(bicubicHeight(grid, c, r)).toBe(dem[r * W + c])
        expect(terrainHeight(grid, c, r, noise)).toBe(dem[r * W + c])
      }
    }
  })

  it('stay exact at grid points with a sharper tension too', () => {
    for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) expect(terrainHeight(grid, c, r, noise, 0.5)).toBe(dem[r * W + c])
  })

  it('round a cliff off less, and overshoot less, with tension', () => {
    // A 10 m cliff between columns 5 and 6.
    const cliff: Grid = { meta, slope, dem: dem.map((_, i) => (i % W >= 6 ? 10 : 0)) }
    const overshoot = (tension: number) => {
      let worst = 0
      for (let k = 1; k < 40; k++) {
        const h = bicubicHeight(cliff, 3 + k * 0.1, 4, tension)!
        worst = Math.max(worst, -h, h - 10)
      }
      return worst
    }
    expect(overshoot(0)).toBeGreaterThan(0.2)
    expect(overshoot(0.5)).toBeLessThan(overshoot(0) / 2 + 1e-9)
    // Closer to the cliff top just past the edge (less rounded): at 5.75 the sharper curve is higher.
    expect(bicubicHeight(cliff, 5.75, 4, 0.5)!).toBeGreaterThan(bicubicHeight(cliff, 5.75, 4, 0)!)
  })

  it('pass smoothly between grid points (a linear slope stays linear)', () => {
    const plane: Grid = { meta, slope, dem: dem.map((_, i) => 10 * (i % W) + 5 * Math.floor(i / W)) }
    expect(bicubicHeight(plane, 3.25, 4.5)).toBeCloseTo(10 * 3.25 + 5 * 4.5, 9)
  })

  it('use the neighbours when one is missing, and are null when all are', () => {
    const holed: Grid = { meta, slope, dem: Float32Array.from(dem) }
    holed.dem[5 * W + 5] = -9999
    expect(Number.isFinite(bicubicHeight(holed, 5.5, 5.5))).toBe(true)
    const empty: Grid = { meta, slope, dem: new Float32Array(W * H).fill(-9999) }
    expect(bicubicHeight(empty, 3, 3)).toBeNull()
  })

  it('bumps are zero at grid points and at most the stated size elsewhere', () => {
    let biggest = 0
    for (let k = 0; k < 2000; k++) {
      const fx = (k * 0.37) % W
      const fy = (k * 0.53) % H
      biggest = Math.max(biggest, Math.abs(bumpNoise(fx, fy, 20, noise)))
    }
    expect(biggest).toBeGreaterThan(0.2) // there are bumps
    expect(biggest).toBeLessThanOrEqual(NOISE_MAX_M)
    for (const [c, r] of [[0, 0], [3, 7], [11, 9], [-4, 20]]) expect(bumpNoise(c, r, 20, noise)).toBe(0)
    // Fading in: tiny next to a grid point.
    expect(Math.abs(bumpNoise(5 + 0.001, 5, 20, noise))).toBeLessThan(1e-4)
  })

  it('maps local metres to grid coordinates consistently with the grid helpers', () => {
    const centre = cellToLatLon(meta, 4, 6)
    const f = makeFrame(centre, R)
    const g = gridMap(meta, f)
    expect(g.fx0).toBeCloseTo(6, 9)
    expect(g.fy0).toBeCloseTo(4, 9)
    expect(g.cellE).toBeCloseTo(20, 3)
    expect(g.cellN).toBeCloseTo(20, 3)
    // One cell east and one north.
    expect(g.fx0 + 20 * g.fxPerE).toBeCloseTo(7, 4)
    expect(g.fy0 + 20 * g.fyPerN).toBeCloseTo(3, 4)
    const back = toLocal(f, toLatLon(f, 123, -45))
    expect(back.e).toBeCloseTo(123, 9)
    expect(back.n).toBeCloseTo(-45, 9)
  })

  it('reads the slope of the cell under a point, null outside', () => {
    expect(slopeAt(grid, 3.4, 2.6)).toBe(3)
    expect(slopeAt(grid, -2, 2)).toBeNull()
  })

  it('builds a chunk mesh with a skirt and upward normals on flat ground', () => {
    const a = buildChunk({ e0: 0, n0: 0, sizeM: 10, spacingM: 2.5, skirtM: 5, heightAt: () => 7, uvAt: () => [0, 0] })
    expect(a.positions.length / 3).toBe(25 + 16)
    expect(a.indices.length).toBe(16 * 6 + 16 * 6)
    expect(a.positions[1]).toBe(7)
    expect(a.positions[25 * 3 + 1]).toBe(2) // first skirt vertex hangs 5 m down
    expect([a.normals[0], a.normals[1], a.normals[2]]).toEqual([-0, 1, 0])
    expect(Math.max(...a.indices)).toBe(25 + 16 - 1)
  })
})
