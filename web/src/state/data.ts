/**
 * The `data` slice (docs/specs/PLANNER_API.md): every file the app loads, read once.
 * JSON keys are converted from snake_case to camelCase here, at the edge, and nowhere else.
 * Talha writes this slice; everyone reads it.
 */

import { create } from 'zustand'
import { fetchDataFile, loadGrid, type FetchFile, type Grid } from '../lib/grid'
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

// ---------- Loading ----------

export interface LoadedData {
  grid: Grid
  manifest: Manifest
  stations: Station[]
  assumptions: Assumption[]
  conditions: Conditions
}

/** Loads and checks every data file. Rejects with the file and field name if any file breaks its contract. */
export async function loadAllData(fetchFile: FetchFile = fetchDataFile): Promise<LoadedData> {
  const json = async (name: string) => readJson(await fetchFile(name), name)
  const [grid, manifest, stations, assumptions, conditions] = await Promise.all([
    loadGrid(fetchFile),
    json('manifest.json').then(parseManifest),
    json('stations.json').then(parseStations),
    json('assumptions.json').then(parseAssumptions),
    json('conditions.json').then(parseConditions),
  ])
  return { grid, manifest, stations, assumptions, conditions }
}

// ---------- Store ----------

interface DataState {
  grid: Grid | null
  manifest: Manifest | null
  stations: Station[]
  assumptions: Assumption[]
  conditions: Conditions | null
  /** True once every file has loaded and passed its checks. */
  loaded: boolean
  /** Loads everything once. Later calls return the same promise. Rejects (and logs) if a file is missing or wrong. */
  load: () => Promise<void>
}

let loading: Promise<void> | null = null

export const useData = create<DataState>()((set) => ({
  grid: null,
  manifest: null,
  stations: [],
  assumptions: [],
  conditions: null,
  loaded: false,
  load: () => {
    loading ??= loadAllData()
      .then((d) => set({ ...d, loaded: true }))
      .catch((err: unknown) => {
        loading = null // allow a retry
        console.error('Data load failed:', err)
        throw err
      })
    return loading
  },
}))
