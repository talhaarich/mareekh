import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { assumptionValue, parseAssumptions } from '../state/data'
import { cellIndex, cellToLatLon, decodeFloat32LE, latLonToCell, loadGrid, parseGridMeta, sample, type FetchFile } from './grid'
import { distanceM } from './mars'

const examples = new URL('../../../examples/data/', import.meta.url)

/** Serves files from a folder on disk, as fetch would from the data folder. */
const fromDisk =
  (dir: string): FetchFile =>
  async (name) => {
    try {
      return new Response(await readFile(new URL(`${dir}/${name}`, examples)))
    } catch {
      return new Response(null, { status: 404 })
    }
  }

const tiny = await loadGrid(fromDisk('tiny'))
const { meta } = tiny

describe('loadGrid on examples/data/tiny', () => {
  it('reads grid.json with keys converted', () => {
    expect(meta).toMatchObject({ width: 8, height: 6, resM: 20, nodata: -9999, dem: 'dem.bin', slope: 'slope.bin' })
  })

  it('reads dem.bin north row first: row r, col c holds 2c metres', () => {
    expect(tiny.dem.length).toBe(48)
    for (let r = 0; r < meta.height; r++) {
      for (let c = 0; c < meta.width; c++) expect(tiny.dem[cellIndex(meta, r, c)]).toBe(2 * c)
    }
  })

  it('reads slope.bin: every cell 5.7106 degrees', () => {
    for (const v of tiny.slope) expect(v).toBeCloseTo(5.7106, 4)
  })

  it('rejects a missing binary file with its name', async () => {
    const noSlope: FetchFile = (name) => (name === 'slope.bin' ? Promise.resolve(new Response(null, { status: 404 })) : fromDisk('tiny')(name))
    await expect(loadGrid(noSlope)).rejects.toThrow('slope.bin: HTTP 404')
  })
})

describe('cell <-> lat/lon', () => {
  it('converts the four corner cells to lat/lon and back (brief, task 2)', () => {
    const corners = [
      [0, 0],
      [0, meta.width - 1],
      [meta.height - 1, 0],
      [meta.height - 1, meta.width - 1],
    ]
    for (const [row, col] of corners) {
      expect(latLonToCell(meta, cellToLatLon(meta, row, col))).toEqual({ row, col })
    }
  })

  it('round-trips every cell', () => {
    for (let row = 0; row < meta.height; row++) {
      for (let col = 0; col < meta.width; col++) expect(latLonToCell(meta, cellToLatLon(meta, row, col))).toEqual({ row, col })
    }
  })

  it('puts row 0, col 0 half a cell in from the north-west corner', () => {
    const [s, w, n, e] = meta.bounds
    const p = cellToLatLon(meta, 0, 0)
    expect(p.lat).toBeCloseTo(n - (n - s) / meta.height / 2, 12)
    expect(p.lon).toBeCloseTo(w + (e - w) / meta.width / 2, 12)
  })

  it('counts the outer edges as inside and anything beyond as outside', () => {
    const [s, w, n, e] = meta.bounds
    expect(latLonToCell(meta, { lat: n, lon: w })).toEqual({ row: 0, col: 0 })
    expect(latLonToCell(meta, { lat: s, lon: e })).toEqual({ row: meta.height - 1, col: meta.width - 1 })
    expect(latLonToCell(meta, { lat: n + 1e-9, lon: w })).toBeNull()
    expect(latLonToCell(meta, { lat: s, lon: e + 1e-9 })).toBeNull()
  })

  it('has cells about res_m apart on Mars (bounds and res_m agree)', async () => {
    const assumptions = parseAssumptions(JSON.parse(await readFile(new URL('jezero/assumptions.json', examples), 'utf-8')))
    const R = assumptionValue(assumptions, 'mars_radius_m')
    const a = cellToLatLon(meta, 2, 2)
    expect(distanceM(a, cellToLatLon(meta, 2, 3), R)).toBeCloseTo(meta.resM, 1)
    expect(distanceM(a, cellToLatLon(meta, 3, 2), R)).toBeCloseTo(meta.resM, 1)
  })
})

describe('sample', () => {
  it('returns height and slope at a point', () => {
    const s = sample(tiny, cellToLatLon(meta, 4, 5))
    expect(s?.heightM).toBe(10)
    expect(s?.slopeDeg).toBeCloseTo(5.7106, 4)
  })

  it('returns null outside the grid or on a no-data cell', () => {
    expect(sample(tiny, { lat: 0, lon: 0 })).toBeNull()
    const holed = { ...tiny, dem: tiny.dem.slice() }
    holed.dem[cellIndex(meta, 1, 1)] = meta.nodata
    expect(sample(holed, cellToLatLon(meta, 1, 1))).toBeNull()
  })
})

describe('format checks', () => {
  it('rejects a binary file of the wrong size', () => {
    expect(() => decodeFloat32LE(new ArrayBuffer(10), 48, 'dem.bin')).toThrow('dem.bin: expected 192 bytes')
  })

  it('rejects grid.json with a missing or wrong field', () => {
    const good = { width: 8, height: 6, res_m: 20, bounds: [18.44, 77.45, 18.442, 77.4528], nodata: -9999, dem: 'dem.bin', slope: 'slope.bin' }
    expect(() => parseGridMeta({ ...good, res_m: undefined })).toThrow('"res_m"')
    expect(() => parseGridMeta({ ...good, width: 8.5 })).toThrow('"width"')
    expect(() => parseGridMeta({ ...good, bounds: [18.442, 77.45, 18.44, 77.4528] })).toThrow('south < north')
  })
})
