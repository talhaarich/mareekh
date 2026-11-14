import { create } from 'zustand'
import { dataUrl } from '../lib/dataUrl'
import type { Manifest, Station } from './dataTypes'

/**
 * TEMPORARY SEAM. The shared `data` slice (manifest, stations, ...) belongs to Talha's loaders.
 * Until they exist, this small store fetches the two files the map needs, through his
 * dataUrl() helper. When his slice lands, replace the body of this hook with a selector on it
 * and keep the same field names (`manifest`, `stations`, `status`): no component changes.
 */

interface RawStation {
  id: string
  name: string
  lat: number
  lon: number
  task: string
  dwell_s: number
  sol: number | null
  photos: Station['photos']
}

export interface MissionDataState {
  status: 'idle' | 'loading' | 'ready' | 'error'
  error: string | null
  manifest: Manifest | null
  stations: Station[]
  /**
   * layer id -> true if its picture file exists. Missing key = not checked yet.
   * The pipeline builds the pictures, so on a fresh checkout some are absent.
   */
  available: Record<string, boolean>
  load: () => Promise<void>
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`)
  return (await res.json()) as T
}

/** A dev server answers a missing file with index.html, so check the type too. */
async function imageExists(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { method: 'HEAD' })
    return res.ok && (res.headers.get('content-type') ?? '').startsWith('image/')
  } catch {
    return false
  }
}

export const useMissionData = create<MissionDataState>()((set, get) => ({
  status: 'idle',
  error: null,
  manifest: null,
  stations: [],
  available: {},

  load: async () => {
    if (get().status !== 'idle') return
    set({ status: 'loading' })
    try {
      const [manifest, rawStations] = await Promise.all([
        fetchJson<Manifest>(dataUrl('manifest.json')),
        fetchJson<RawStation[]>(dataUrl('stations.json')),
      ])
      // snake_case -> camelCase once, at the edge (CONVENTIONS.md)
      const stations: Station[] = rawStations.map((s) => ({
        id: s.id,
        name: s.name,
        lat: s.lat,
        lon: s.lon,
        task: s.task,
        dwellS: s.dwell_s,
        sol: s.sol,
        photos: s.photos,
      }))
      set({ status: 'ready', manifest, stations })

      const pictures = manifest.layers.filter((l) => l.type === 'image')
      const checks = await Promise.all(pictures.map((l) => imageExists(dataUrl(l.url))))
      const available: Record<string, boolean> = {}
      pictures.forEach((l, i) => {
        available[l.id] = checks[i]
      })
      set({ available })
    } catch (e) {
      set({ status: 'error', error: e instanceof Error ? e.message : String(e) })
    }
  },
}))
