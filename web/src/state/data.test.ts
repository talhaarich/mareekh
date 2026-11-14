import { readFile } from 'node:fs/promises'
import { describe, expect, it, vi } from 'vitest'
import { gridScaleWarnings, parseGridMeta, type FetchFile } from '../lib/grid'
import { distanceM } from '../lib/mars'
import { assumptionValue, createDataStore, parseAssumptions, parseConditions, parseManifest, parseStations } from './data'

const repo = new URL('../../../', import.meta.url)

const readJsonFile = async (path: string): Promise<unknown> => JSON.parse(await readFile(new URL(path, repo), 'utf-8'))

/** JSON from the example Jezero files; grids from the tiny example (the Jezero example has no binaries). */
const exampleFiles: FetchFile = async (name) => {
  const dir = ['grid.json', 'dem.bin', 'slope.bin'].includes(name) ? 'tiny' : 'jezero'
  return new Response(await readFile(new URL(`examples/data/${dir}/${name}`, repo)))
}

describe('data store', () => {
  const missing = (...names: string[]): FetchFile => (name) => (names.includes(name) ? Promise.resolve(new Response(null, { status: 404 })) : exampleFiles(name))
  const quiet = () => vi.spyOn(console, 'error').mockImplementation(() => {})

  it('loads and converts every example file', async () => {
    const useStore = createDataStore(exampleFiles)
    await useStore.getState().load()
    const d = useStore.getState()
    expect(d).toMatchObject({ loaded: true, gridError: null })
    expect(d.grid?.meta.width).toBe(8)
    expect(d.stations[0]).toMatchObject({ id: 'B', dwellS: 0, sol: null })
    expect(d.stations.slice(1).every((s) => /^S\d+$/.test(s.id))).toBe(true)
    expect(d.manifest?.region.base).toEqual({ lat: 18.4446, lon: 77.4509 })
    expect(d.manifest?.layers.filter((l) => l.group === 'view' && l.default)).toHaveLength(1)
    expect(d.conditions).toMatchObject({ tau: 0.4, airTempK: 211, pressurePa: 730 })
    expect(assumptionValue(d.assumptions, 'eva_time_limit_s')).toBe(21600)
  })

  it('without grid files, still loads the map and cards; only the grid reports an error', async () => {
    const log = quiet()
    const useStore = createDataStore(missing('dem.bin', 'slope.bin'))
    await useStore.getState().load() // does not reject
    const d = useStore.getState()
    expect(d).toMatchObject({ loaded: true, grid: null })
    expect(d.gridError).toMatch(/^(dem|slope)\.bin: HTTP 404$/)
    expect(d.manifest).not.toBeNull()
    expect(d.stations.length).toBeGreaterThan(1)
    log.mockRestore()
  })

  it('with a JSON file missing, rejects and is not loaded, but keeps everything that did arrive', async () => {
    const log = quiet()
    const useStore = createDataStore(missing('manifest.json'))
    await expect(useStore.getState().load()).rejects.toThrow('manifest.json: HTTP 404')
    const d = useStore.getState()
    expect(d).toMatchObject({ loaded: false, manifest: null, gridError: null })
    expect(d.stations.length).toBeGreaterThan(1)
    expect(d.grid).not.toBeNull()
    log.mockRestore()
  })

  it('loads once: a second call returns the same promise', () => {
    const useStore = createDataStore(exampleFiles)
    expect(useStore.getState().load()).toBe(useStore.getState().load())
  })

  it('warns when grid cells are not res_m on the ground', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const skewed: FetchFile = async (name) => {
      if (name !== 'grid.json') return exampleFiles(name)
      const g = JSON.parse(await readFile(new URL('examples/data/tiny/grid.json', repo), 'utf-8'))
      g.bounds[3] = g.bounds[1] + (g.bounds[3] - g.bounds[1]) * 1.05 // 5% too wide east-west
      return new Response(JSON.stringify(g))
    }
    await createDataStore(skewed).getState().load()
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn.mock.calls[0][0]).toMatch(/^grid\.json: cells are 21\.0 m east-west on the ground, not 20 m\. Check the DEM projection\.$/)
    warn.mockRestore()
  })
})

describe('gridScaleWarnings', () => {
  it('passes the example grids', async () => {
    const R = assumptionValue(parseAssumptions(await readJsonFile('examples/data/jezero/assumptions.json')), 'mars_radius_m')
    for (const f of ['examples/data/tiny/grid.json', 'examples/data/jezero/grid.json', 'web/public/data/jezero/grid.json']) {
      expect(gridScaleWarnings(parseGridMeta(await readJsonFile(f)), R), f).toEqual([])
    }
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
