/**
 * The `data` slice (docs/specs/PLANNER_API.md): every file the app loads, read once.
 * JSON keys are converted from snake_case to camelCase here, at the edge, and nowhere else.
 * Talha writes this slice; everyone reads it.
 */

import { create } from 'zustand'
import { fetchDataFile, gridScaleWarnings, loadGrid, type FetchFile, type Grid } from '../lib/grid'
import type { LatLon } from '../lib/mars'
import { asArray, asObject, bounds, int, num, oneOf, readJson, str } from '../lib/parse'

// ---------- Types (CONTRACTS.md, camelCase) ----------

export interface Photo {
  url: string
  camera: string
  sol: number
  credit: string
}

export interface Station {
  id: string
  name: string
  lat: number
  lon: number
  task: string
  /** Time spent at the station, seconds. 0 for base. */
  dwellS: number
  sol: number | null
  photos: Photo[]
}

export interface LegendItem {
  color: string
  label: string
}

export interface Layer {
  id: string
  name: string
  group: 'view' | 'overlay'
  type: 'image' | 'terrain'
  /** Path relative to the data folder. */
  url: string
  /** MapLibre image-source order: `[lon, lat]` for top-left, top-right, bottom-right, bottom-left. Absent for terrain. */
  coordinates?: [[number, number], [number, number], [number, number], [number, number]]
  default?: boolean
  legend: LegendItem[]
  credit: string
  caveat: string
}

export interface Manifest {
  region: { name: string; bounds: [number, number, number, number]; base: LatLon }
  layers: Layer[]
}

export interface Assumption {
  key: string
  /** In the units of CONVENTIONS.md. */
  value: number
  unit: string
  source: string
  url: string
  kind: 'published' | 'team'
}

export interface Conditions {
  sol: number
  tau: number
  airTempK: number
  pressurePa: number
  source: string
  caveat: string
}

// ---------- Parsers ----------

export function parseStations(raw: unknown): Station[] {
  const list = asArray(raw, 'stations.json').map((item, i) => {
    const where = `stations.json[${i}]`
    const o = asObject(item, where)
    const sol = o.sol === null ? null : int(o, 'sol', where)
    return {
      id: str(o, 'id', where),
      name: str(o, 'name', where),
      lat: num(o, 'lat', where),
      lon: num(o, 'lon', where),
      task: str(o, 'task', where),
      dwellS: int(o, 'dwell_s', where),
      sol,
      photos: asArray(o.photos, `${where}.photos`).map((ph, j) => {
        const pw = `${where}.photos[${j}]`
        const p = asObject(ph, pw)
        return { url: str(p, 'url', pw), camera: str(p, 'camera', pw), sol: int(p, 'sol', pw), credit: str(p, 'credit', pw) }
      }),
    }
  })
  if (list.length === 0 || list[0].id !== 'B') throw new Error('stations.json: the first station must be base, id "B"')
  return list
}

function parseCoordinates(value: unknown, where: string): Layer['coordinates'] {
  const arr = asArray(value, `${where}.coordinates`)
  const ok =
    arr.length === 4 &&
    arr.every((pair) => Array.isArray(pair) && pair.length === 2 && pair.every((x) => typeof x === 'number' && Number.isFinite(x)))
  if (!ok) throw new Error(`${where}: "coordinates" must be four [lon, lat] pairs`)
  return arr as Layer['coordinates']
}

export function parseManifest(raw: unknown): Manifest {
  const where = 'manifest.json'
  const o = asObject(raw, where)
  const r = asObject(o.region, `${where}.region`)
  const b = asObject(r.base, `${where}.region.base`)
  const layers = asArray(o.layers, `${where}.layers`).map((item, i) => {
    const lw = `${where}.layers[${i}]`
    const l = asObject(item, lw)
    const type = oneOf(l, 'type', ['image', 'terrain'] as const, lw)
    if (l.default !== undefined && typeof l.default !== 'boolean') throw new Error(`${lw}: "default" must be true or false`)
    const layer: Layer = {
      id: str(l, 'id', lw),
      name: str(l, 'name', lw),
      group: oneOf(l, 'group', ['view', 'overlay'] as const, lw),
      type,
      url: str(l, 'url', lw),
      legend: asArray(l.legend, `${lw}.legend`).map((li, j) => {
        const gw = `${lw}.legend[${j}]`
        const g = asObject(li, gw)
        return { color: str(g, 'color', gw), label: str(g, 'label', gw) }
      }),
      credit: str(l, 'credit', lw),
      caveat: str(l, 'caveat', lw),
    }
    if (type === 'image') layer.coordinates = parseCoordinates(l.coordinates, lw)
    if (l.default !== undefined) layer.default = l.default as boolean
    return layer
  })
  return {
    region: {
      name: str(r, 'name', `${where}.region`),
      bounds: bounds(r, 'bounds', `${where}.region`),
      base: { lat: num(b, 'lat', `${where}.region.base`), lon: num(b, 'lon', `${where}.region.base`) },
    },
    layers,
  }
}

export function parseAssumptions(raw: unknown): Assumption[] {
  return asArray(raw, 'assumptions.json').map((item, i) => {
    const where = `assumptions.json[${i}]`
    const o = asObject(item, where)
    return {
      key: str(o, 'key', where),
      value: num(o, 'value', where),
      unit: str(o, 'unit', where),
      source: str(o, 'source', where),
      url: str(o, 'url', where),
      kind: oneOf(o, 'kind', ['published', 'team'] as const, where),
    }
  })
}

export function parseConditions(raw: unknown): Conditions {
  const where = 'conditions.json'
  const o = asObject(raw, where)
  return {
    sol: int(o, 'sol', where),
    tau: num(o, 'tau', where),
    airTempK: num(o, 'air_temp_k', where),
    pressurePa: num(o, 'pressure_pa', where),
    source: str(o, 'source', where),
    caveat: str(o, 'caveat', where),
  }
}

/** The value of one assumption by key. Throws if the key is missing, so a typo never becomes a silent default. */
export function assumptionValue(assumptions: Assumption[], key: string): number {
  const a = assumptions.find((x) => x.key === key)
  if (!a) throw new Error(`assumptions.json: no entry for "${key}"`)
  return a.value
}

// ---------- Store ----------

interface DataState {
  /** Null until loaded, or when it could not load (see gridError). Only planning needs it. */
  grid: Grid | null
  manifest: Manifest | null
  stations: Station[]
  assumptions: Assumption[]
  conditions: Conditions | null
  /**
   * True once manifest, stations, assumptions and conditions have all loaded and passed their checks.
   * The grid loads separately: the map and station cards work without it.
   */
  loaded: boolean
  /** Why the grid could not load (missing or broken grid.json / .bin files); null otherwise. */
  gridError: string | null
  /**
   * Loads everything once; later calls return the same promise. Each file is set as soon as it arrives.
   * Rejects (and logs) if a JSON file is missing or wrong; a grid failure only sets gridError.
   */
  load: () => Promise<void>
}

const message = (err: unknown) => (err instanceof Error ? err.message : String(err))

/** A data store reading files with `fetchFile`. The app uses `useData`; tests make their own. */
export function createDataStore(fetchFile: FetchFile) {
  let loading: Promise<void> | null = null

  return create<DataState>()((set, get) => {
    async function loadAll(): Promise<void> {
      const json = async <T>(name: string, parse: (raw: unknown) => T): Promise<T> => parse(await readJson(await fetchFile(name), name))
      const files = Promise.allSettled([
        json('manifest.json', parseManifest).then((manifest) => set({ manifest })),
        json('stations.json', parseStations).then((stations) => set({ stations })),
        json('assumptions.json', parseAssumptions).then((assumptions) => set({ assumptions })),
        json('conditions.json', parseConditions).then((conditions) => set({ conditions })),
      ])
      const grid = loadGrid(fetchFile).then(
        (g) => set({ grid: g, gridError: null }),
        (err: unknown) => {
          set({ gridError: message(err) })
          console.error('Grid load failed (planning is off until it loads):', message(err))
        },
      )

      const failed = (await files).filter((r): r is PromiseRejectedResult => r.status === 'rejected')
      if (failed.length === 0) set({ loaded: true })

      await grid
      const { grid: g, assumptions } = get()
      const radius = assumptions.find((a) => a.key === 'mars_radius_m')
      if (g && radius) for (const w of gridScaleWarnings(g.meta, radius.value)) console.warn(w)

      if (failed.length > 0) {
        for (const f of failed) console.error('Data load failed:', message(f.reason))
        throw failed[0].reason
      }
    }

    return {
      grid: null,
      manifest: null,
      stations: [],
      assumptions: [],
      conditions: null,
      loaded: false,
      gridError: null,
      load: () => {
        loading ??= loadAll().catch((err: unknown) => {
          loading = null // allow a retry
          throw err
        })
        return loading
      },
    }
  })
}

export const useData = createDataStore(fetchDataFile)
