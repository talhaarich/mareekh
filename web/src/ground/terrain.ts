/**
 * Ground heights for the 3D scene, pure (no three.js). Heights come from the 20 m height grid
 * (dem.bin, DATA), interpolated bicubically (Catmull-Rom, which passes exactly through every grid point),
 * plus small illustrative bumps that are zero at every grid point, so each measured height stays exact.
 *
 * Local frame: metres east (e) and north (n) of the patch centre, on the Mars sphere (mars_radius_m).
 * Grid coordinates: fractional column fx and row fy, with cell centres at whole numbers (CONVENTIONS).
 */

import type { Grid, GridMeta } from '../lib/grid'
import type { LatLon } from '../lib/mars'

const RAD = Math.PI / 180

export interface Frame {
  lat0: number
  lon0: number
  /** Metres per degree of latitude and of longitude at the centre. */
  mPerDegLat: number
  mPerDegLon: number
}

export function makeFrame(center: LatLon, marsRadiusM: number): Frame {
  const mPerDegLat = marsRadiusM * RAD
  return { lat0: center.lat, lon0: center.lon, mPerDegLat, mPerDegLon: mPerDegLat * Math.cos(center.lat * RAD) }
}

export function toLocal(f: Frame, p: LatLon): { e: number; n: number } {
  return { e: (p.lon - f.lon0) * f.mPerDegLon, n: (p.lat - f.lat0) * f.mPerDegLat }
}

export function toLatLon(f: Frame, e: number, n: number): LatLon {
  return { lat: f.lat0 + n / f.mPerDegLat, lon: f.lon0 + e / f.mPerDegLon }
}

/** Linear map from local metres to grid coordinates (the grid is equirectangular, so this is exact). */
export interface GridMap {
  fx0: number
  fxPerE: number
  fy0: number
  fyPerN: number
  /** Ground size of one cell, metres (east-west and north-south). */
  cellE: number
  cellN: number
}

export function gridMap(meta: GridMeta, f: Frame): GridMap {
  const [s, w, n, e] = meta.bounds
  const degPerCol = (e - w) / meta.width
  const degPerRow = (n - s) / meta.height
  return {
    fx0: (f.lon0 - w) / degPerCol - 0.5,
    fxPerE: 1 / (degPerCol * f.mPerDegLon),
    fy0: (n - f.lat0) / degPerRow - 0.5,
    fyPerN: -1 / (degPerRow * f.mPerDegLat),
    cellE: degPerCol * f.mPerDegLon,
    cellN: degPerRow * f.mPerDegLat,
  }
}

/** Height of one cell (metres), with the index clamped to the grid; null on no data. */
export function cellHeight(grid: Grid, row: number, col: number): number | null {
  const { width, height, nodata } = grid.meta
  const r = Math.min(height - 1, Math.max(0, row))
  const c = Math.min(width - 1, Math.max(0, col))
  const v = grid.dem[r * width + c]
  return v === nodata || !Number.isFinite(v) ? null : v
}

/**
 * Cardinal spline between p1 (t = 0) and p2 (t = 1): Catmull-Rom at tension 0; higher tension shortens the
 * tangents, so edges (crater rims, scarps) are rounded off less and overshoot less. Exactly p1 at t = 0.
 */
function cardinal(p0: number, p1: number, p2: number, p3: number, t: number, tension: number): number {
  const k = (1 - tension) / 2
  const m1 = k * (p2 - p0)
  const m2 = k * (p3 - p1)
  const t2 = t * t
  const t3 = t2 * t
  return (2 * t3 - 3 * t2 + 1) * p1 + (t3 - 2 * t2 + t) * m1 + (-2 * t3 + 3 * t2) * p2 + (t3 - t2) * m2
}

const neighbours = new Float64Array(16)

/**
 * Bicubic height at fractional grid coordinates, metres. Exact at whole (fx, fy). Outside the grid the
 * edge cells are used. Missing neighbours are replaced by the mean of the others; null if all 16 are missing.
 * `tension` 0 is Catmull-Rom; up to 1 is sharper (see cardinal()).
 */
export function bicubicHeight(grid: Grid, fx: number, fy: number, tension = 0): number | null {
  const { width, height } = grid.meta
  const x = Math.min(width - 1, Math.max(0, fx))
  const y = Math.min(height - 1, Math.max(0, fy))
  const c0 = Math.floor(x)
  const r0 = Math.floor(y)
  const tx = x - c0
  const ty = y - r0
  let sum = 0
  let valid = 0
  let missing = false
  for (let j = 0; j < 4; j++) {
    for (let i = 0; i < 4; i++) {
      const v = cellHeight(grid, r0 - 1 + j, c0 - 1 + i)
      if (v === null) {
        missing = true
        neighbours[j * 4 + i] = NaN
      } else {
        neighbours[j * 4 + i] = v
        sum += v
        valid++
      }
    }
  }
  if (valid === 0) return null
  if (missing) {
    const mean = sum / valid
    for (let k = 0; k < 16; k++) if (Number.isNaN(neighbours[k])) neighbours[k] = mean
  }
  const nb = neighbours
  return cardinal(
    cardinal(nb[0], nb[1], nb[2], nb[3], tx, tension),
    cardinal(nb[4], nb[5], nb[6], nb[7], tx, tension),
    cardinal(nb[8], nb[9], nb[10], nb[11], tx, tension),
    cardinal(nb[12], nb[13], nb[14], nb[15], tx, tension),
    ty,
    tension,
  )
}

/** Integer hash to [0, 1). */
function hash2(ix: number, iy: number, seed: number): number {
  let h = Math.imul(ix, 0x27d4eb2d) ^ Math.imul(iy, 0x165667b1) ^ Math.imul(seed, 0x9e3779b1)
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b)
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35)
  h ^= h >>> 16
  return (h >>> 0) / 4294967296
}

/** Smooth value noise in [0, 1) at (x, y) in lattice units. */
function valueNoise(x: number, y: number, seed: number): number {
  const ix = Math.floor(x)
  const iy = Math.floor(y)
  const fx = x - ix
  const fy = y - iy
  const sx = fx * fx * fx * (fx * (fx * 6 - 15) + 10)
  const sy = fy * fy * fy * (fy * (fy * 6 - 15) + 10)
  const a = hash2(ix, iy, seed)
  const b = hash2(ix + 1, iy, seed)
  const c = hash2(ix, iy + 1, seed)
  const d = hash2(ix + 1, iy + 1, seed)
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy
}

export interface NoiseOptions {
  maxM: number
  wavelengthM: number
  octaves: number
  clearM: number
  seed: number
}

/**
 * Illustrative bumps in metres at fractional grid coordinates: fractal value noise of at most `maxM`,
 * faded to exactly zero at every grid point (within `clearM` metres of it).
 */
export function bumpNoise(fx: number, fy: number, cellM: number, o: NoiseOptions): number {
  const dx = (fx - Math.round(fx)) * cellM
  const dy = (fy - Math.round(fy)) * cellM
  const d = Math.hypot(dx, dy)
  if (d === 0) return 0
  const k = Math.min(1, d / o.clearM)
  const fade = k * k * (3 - 2 * k)
  // Noise in metres, so it does not stretch with the cell shape.
  const xm = fx * cellM
  const ym = fy * cellM
  let sum = 0
  let norm = 0
  let amp = 1
  let wl = o.wavelengthM
  for (let i = 0; i < o.octaves; i++) {
    sum += amp * (2 * valueNoise(xm / wl, ym / wl, o.seed + i * 101) - 1)
    norm += amp
    amp *= 0.5
    wl *= 0.5
  }
  return fade * o.maxM * (sum / norm)
}

/** Ground height at fractional grid coordinates, metres: bicubic grid height plus bumps. Null on no data. */
export function terrainHeight(grid: Grid, fx: number, fy: number, noise: NoiseOptions, tension = 0): number | null {
  const h = bicubicHeight(grid, fx, fy, tension)
  if (h === null) return null
  return h + bumpNoise(fx, fy, grid.meta.resM, noise)
}

/** Slope (degrees, DATA from slope.bin) of the cell containing the point; null outside the grid or on no data. */
export function slopeAt(grid: Grid, fx: number, fy: number): number | null {
  const c = Math.round(fx)
  const r = Math.round(fy)
  const { width, height, nodata } = grid.meta
  if (c < 0 || r < 0 || c >= width || r >= height) return null
  const v = grid.slope[r * width + c]
  return v === nodata || !Number.isFinite(v) ? null : v
}

export interface ChunkArrays {
  positions: Float32Array
  normals: Float32Array
  uvs: Float32Array
  indices: Uint32Array
}

/**
 * Mesh arrays for one square chunk, in three.js axes (x east, y up, z south). `heightAt(e, n)` gives
 * the ground (metres), `uvAt(e, n)` the picture coordinates. A skirt hangs `skirtM` below the edges to
 * hide cracks where a neighbour is drawn at another spacing.
 */
export function buildChunk(o: {
  e0: number
  n0: number
  sizeM: number
  spacingM: number
  skirtM: number
  heightAt: (e: number, n: number) => number
  uvAt: (e: number, n: number) => [number, number]
}): ChunkArrays {
  const steps = Math.max(1, Math.round(o.sizeM / o.spacingM))
  const s = o.sizeM / steps
  const side = steps + 1
  const ring = 4 * steps
  const count = side * side + ring
  const positions = new Float32Array(count * 3)
  const normals = new Float32Array(count * 3)
  const uvs = new Float32Array(count * 2)
  // Heights once per vertex, with a one-vertex border for the normals: index (j + 1) * (side + 2) + (i + 1).
  const hs = side + 2
  const heights = new Float64Array(hs * hs)
  for (let j = -1; j <= side; j++) for (let i = -1; i <= side; i++) heights[(j + 1) * hs + (i + 1)] = o.heightAt(o.e0 + i * s, o.n0 + j * s)
  const hAt = (i: number, j: number) => heights[(j + 1) * hs + (i + 1)]
  const put = (k: number, i: number, j: number, drop: number) => {
    const e = o.e0 + i * s
    const n = o.n0 + j * s
    positions[k * 3] = e
    positions[k * 3 + 1] = hAt(i, j) - drop
    positions[k * 3 + 2] = -n
    const dhe = (hAt(i + 1, j) - hAt(i - 1, j)) / (2 * s)
    const dhn = (hAt(i, j + 1) - hAt(i, j - 1)) / (2 * s)
    const len = Math.hypot(dhe, 1, dhn)
    normals[k * 3] = -dhe / len
    normals[k * 3 + 1] = 1 / len
    normals[k * 3 + 2] = dhn / len
    const [u, v] = o.uvAt(e, n)
    uvs[k * 2] = u
    uvs[k * 2 + 1] = v
  }
  // Row j goes north from n0, column i east from e0.
  for (let j = 0; j < side; j++) for (let i = 0; i < side; i++) put(j * side + i, i, j, 0)

  // Border vertices in order round the edge, and a skirt vertex under each.
  const border: number[] = []
  for (let i = 0; i < steps; i++) border.push(i) // south edge, west to east
  for (let j = 0; j < steps; j++) border.push(j * side + steps) // east edge, south to north
  for (let i = steps; i > 0; i--) border.push(steps * side + i) // north edge, east to west
  for (let j = steps; j > 0; j--) border.push(j * side) // west edge, north to south
  border.forEach((v, k) => put(side * side + k, v % side, Math.floor(v / side), o.skirtM))

  const indices = new Uint32Array(steps * steps * 6 + ring * 6)
  let t = 0
  for (let j = 0; j < steps; j++) {
    for (let i = 0; i < steps; i++) {
      const a = j * side + i
      const b = a + 1
      const c = a + side
      const d = c + 1
      // Counter-clockwise seen from above (y up, z south).
      indices.set([a, b, c, b, d, c], t)
      t += 6
    }
  }
  for (let k = 0; k < ring; k++) {
    const a = border[k]
    const b = border[(k + 1) % ring]
    const sa = side * side + k
    const sb = side * side + ((k + 1) % ring)
    indices.set([a, sa, b, b, sa, sb], t)
    t += 6
  }
  return { positions, normals, uvs, indices }
}
