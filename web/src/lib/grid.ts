/**
 * Height and slope grids: loading grid.json + dem.bin + slope.bin, and converting between cells and lat/lon.
 * Format: docs/specs/CONTRACTS.md. Layout: docs/specs/CONVENTIONS.md (row 0 north, col 0 west,
 * index = row * width + col, a cell's position is its centre, equirectangular over `bounds`).
 */

import { dataUrl } from './dataUrl'
import type { LatLon } from './mars'
import { asObject, bounds, int, num, readJson, str } from './parse'

export interface GridMeta {
  width: number
  height: number
  /** Cell size, metres. */
  resM: number
  /** `[south, west, north, east]`, degrees, outer edges of the grid. */
  bounds: [number, number, number, number]
  /** Value meaning "no data" in the binary grids. */
  nodata: number
  /** File name of the height grid. */
  dem: string
  /** File name of the slope grid. */
  slope: string
}

export interface Grid {
  meta: GridMeta
  /** Height per cell, metres. */
  dem: Float32Array
  /** Slope per cell, degrees (Horn method, from the pipeline). */
  slope: Float32Array
}

export type Cell = { row: number; col: number }

/** Fetches one file from the data folder by name. Swappable so tests can read from disk. */
export type FetchFile = (fileName: string) => Promise<Response>

export const fetchDataFile: FetchFile = (fileName) => fetch(dataUrl(fileName))

/** Converts grid.json (snake_case) to GridMeta, checking every field. */
export function parseGridMeta(raw: unknown): GridMeta {
  const where = 'grid.json'
  const o = asObject(raw, where)
  const meta: GridMeta = {
    width: int(o, 'width', where),
    height: int(o, 'height', where),
    resM: num(o, 'res_m', where),
    bounds: bounds(o, 'bounds', where),
    nodata: num(o, 'nodata', where),
    dem: str(o, 'dem', where),
    slope: str(o, 'slope', where),
  }
  if (meta.width <= 0 || meta.height <= 0) throw new Error(`${where}: width and height must be positive`)
  if (meta.resM <= 0) throw new Error(`${where}: res_m must be positive`)
  return meta
}

/** Decodes raw Float32 little-endian values (no header). Throws if the size is not `count` values. */
export function decodeFloat32LE(buffer: ArrayBuffer, count: number, fileName: string): Float32Array {
  if (buffer.byteLength !== count * 4) {
    throw new Error(`${fileName}: expected ${count * 4} bytes (${count} Float32 values), got ${buffer.byteLength}`)
  }
  const view = new DataView(buffer)
  const out = new Float32Array(count)
  for (let i = 0; i < count; i++) out[i] = view.getFloat32(i * 4, true)
  return out
}

async function fetchBinary(fetchFile: FetchFile, fileName: string): Promise<ArrayBuffer> {
  const res = await fetchFile(fileName)
  if (!res.ok) throw new Error(`${fileName}: HTTP ${res.status}`)
  return res.arrayBuffer()
}

/** Loads grid.json and the two binary grids it names. */
export async function loadGrid(fetchFile: FetchFile = fetchDataFile): Promise<Grid> {
  const meta = parseGridMeta(await readJson(await fetchFile('grid.json'), 'grid.json'))
  const count = meta.width * meta.height
  const [demBuf, slopeBuf] = await Promise.all([fetchBinary(fetchFile, meta.dem), fetchBinary(fetchFile, meta.slope)])
  return {
    meta,
    dem: decodeFloat32LE(demBuf, count, meta.dem),
    slope: decodeFloat32LE(slopeBuf, count, meta.slope),
  }
}

/** Index of a cell in the binary grids. */
export function cellIndex(meta: GridMeta, row: number, col: number): number {
  return row * meta.width + col
}

/** Centre of a cell, in degrees. */
export function cellToLatLon(meta: GridMeta, row: number, col: number): LatLon {
  const [s, w, n, e] = meta.bounds
  return {
    lat: n - ((row + 0.5) * (n - s)) / meta.height,
    lon: w + ((col + 0.5) * (e - w)) / meta.width,
  }
}

/** The cell containing a point, or null outside the grid. Points on the outer edges count as inside. */
export function latLonToCell(meta: GridMeta, p: LatLon): Cell | null {
  const [s, w, n, e] = meta.bounds
  if (!(p.lat >= s && p.lat <= n && p.lon >= w && p.lon <= e)) return null
  const row = Math.min(meta.height - 1, Math.floor(((n - p.lat) / (n - s)) * meta.height))
  const col = Math.min(meta.width - 1, Math.floor(((p.lon - w) / (e - w)) * meta.width))
  return { row, col }
}

/** Height (metres) and slope (degrees) at a point. Null outside the grid or where either grid has no data. */
export function sample(grid: Grid, p: LatLon): { heightM: number; slopeDeg: number } | null {
  const cell = latLonToCell(grid.meta, p)
  if (!cell) return null
  const i = cellIndex(grid.meta, cell.row, cell.col)
  const heightM = grid.dem[i]
  const slopeDeg = grid.slope[i]
  if (heightM === grid.meta.nodata || slopeDeg === grid.meta.nodata) return null
  return { heightM, slopeDeg }
}

/**
 * Warnings when grid cells are not res_m x res_m on the ground (more than 2% off), one per axis.
 * The planner treats cells as square; that only holds if the DEM's projection is centred near the grid's
 * latitude. Otherwise east-west distances, times and slopes are off by several percent: say so loudly.
 */
export function gridScaleWarnings(meta: GridMeta, marsRadiusM: number): string[] {
  const [s, w, n, e] = meta.bounds
  const rad = Math.PI / 180
  const cellNS = ((n - s) * rad * marsRadiusM) / meta.height
  const cellEW = ((e - w) * rad * marsRadiusM * Math.cos(((s + n) / 2) * rad)) / meta.width
  const out: string[] = []
  for (const [axis, m] of [['north-south', cellNS], ['east-west', cellEW]] as const) {
    if (Math.abs(m / meta.resM - 1) > 0.02) {
      out.push(`grid.json: cells are ${m.toFixed(1)} m ${axis} on the ground, not ${meta.resM} m. Check the DEM projection.`)
    }
  }
  return out
}
