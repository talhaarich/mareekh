import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { parseGridMeta, type FetchFile } from '../lib/grid'
import { distanceM } from '../lib/mars'
import { assumptionValue, loadAllData, parseAssumptions, parseConditions, parseManifest, parseStations } from './data'

const repo = new URL('../../../', import.meta.url)

const readJsonFile = async (path: string): Promise<unknown> => JSON.parse(await readFile(new URL(path, repo), 'utf-8'))

/** JSON from the example Jezero files; grids from the tiny example (the Jezero example has no binaries). */
const exampleFiles: FetchFile = async (name) => {
  const dir = ['grid.json', 'dem.bin', 'slope.bin'].includes(name) ? 'tiny' : 'jezero'
  return new Response(await readFile(new URL(`examples/data/${dir}/${name}`, repo)))
}

describe('loadAllData', () => {
  it('loads and converts every example file', async () => {
    const d = await loadAllData(exampleFiles)
    expect(d.grid.meta.width).toBe(8)
    expect(d.stations[0]).toMatchObject({ id: 'B', dwellS: 0, sol: null })
    expect(d.stations.slice(1).every((s) => /^S\d+$/.test(s.id))).toBe(true)
    expect(d.manifest.region.base).toEqual({ lat: 18.4446, lon: 77.4509 })
    expect(d.manifest.layers.filter((l) => l.group === 'view' && l.default)).toHaveLength(1)
    expect(d.conditions).toMatchObject({ tau: 0.4, airTempK: 211, pressurePa: 730 })
    expect(assumptionValue(d.assumptions, 'eva_time_limit_s')).toBe(21600)
  })
})

// The app's data folder is replaced by pull requests from the pipeline. These checks
// catch a file that breaks its contract before it reaches the live link.
describe('web/public/data/jezero matches CONTRACTS.md', () => {
  const dir = 'web/public/data/jezero/'
  it('manifest.json', async () => {
    const m = parseManifest(await readJsonFile(`${dir}manifest.json`))
    expect(m.layers.length).toBeGreaterThan(0)
  })
  it('stations.json', async () => {
    expect(parseStations(await readJsonFile(`${dir}stations.json`))[0].id).toBe('B')
  })
  it('assumptions.json has every key listed in docs/assumptions.md', async () => {
    const a = parseAssumptions(await readJsonFile(`${dir}assumptions.json`))
    const doc = await readFile(new URL('docs/assumptions.md', repo), 'utf-8')
    const keys = [...doc.matchAll(/^\| `([a-z0-9_]+)` \|/gm)].map((x) => x[1])
    expect(keys).toHaveLength(20)
    for (const k of keys) expect(() => assumptionValue(a, k)).not.toThrow()
  })
  it('grid.json bounds agree with width x res_m and height x res_m (within 2%)', async () => {
    // The planner measures by res_m and the range/bearing helpers by lat/lon: they must describe the same ground.
    const g = parseGridMeta(await readJsonFile(`${dir}grid.json`))
    const R = assumptionValue(parseAssumptions(await readJsonFile(`${dir}assumptions.json`)), 'mars_radius_m')
    const [s, w, n, e] = g.bounds
    const mid = (s + n) / 2
    const northSouthM = distanceM({ lat: s, lon: w }, { lat: n, lon: w }, R)
    const eastWestM = distanceM({ lat: mid, lon: w }, { lat: mid, lon: e }, R)
    expect(Math.abs(northSouthM / (g.height * g.resM) - 1)).toBeLessThan(0.02)
    expect(Math.abs(eastWestM / (g.width * g.resM) - 1)).toBeLessThan(0.02)
  })
  it('conditions.json', async () => {
    parseConditions(await readJsonFile(`${dir}conditions.json`))
  })
})

describe('parsers reject broken files', () => {
  it('stations.json must start with base', () => {
    expect(() => parseStations([])).toThrow('first station must be base')
  })
  it('a station needs dwell_s as a whole number', () => {
    const b = { id: 'B', name: 'Base', lat: 18, lon: 77, task: 't', dwell_s: 1.5, sol: null, photos: [] }
    expect(() => parseStations([b])).toThrow('stations.json[0]: "dwell_s"')
  })
  it('an image layer needs four corners', () => {
    const m = {
      region: { name: 'x', bounds: [18, 77, 19, 78], base: { lat: 18.5, lon: 77.5 } },
      layers: [{ id: 'satellite', name: 'Satellite', group: 'view', type: 'image', url: 'a.png', coordinates: [[77, 19]], legend: [], credit: 'c', caveat: '' }],
    }
    expect(() => parseManifest(m)).toThrow('four [lon, lat] pairs')
  })
  it('a missing assumption key throws instead of defaulting', () => {
    expect(() => assumptionValue([], 'mars_radius_m')).toThrow('no entry for "mars_radius_m"')
  })
})
