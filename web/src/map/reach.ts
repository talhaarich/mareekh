import { useMemo } from 'react'
import type { Feature, Polygon } from 'geojson'
import { cellToLatLon } from '../lib/grid'
import { uncertaintyRing } from '../lib/helpers'
import { useData } from '../state/data'
import { getWalkHomeField, usePlan } from '../state/plan'
import { useView } from '../state/view'
import type { LabelItem } from './MapLabels'
import { walkTimeLines } from './walkTimeLines'

/** Shared data for the "reach from base" layer, its labels and its key. */

/** Distance rings around base, km. Display choices; the walk-back limit ring comes from assumptions. */
export const RING_KM = [1, 2, 3, 4]
/** Walk-time lines every 30 min up to 90 min (docs/HOW_IT_WORKS.md, walk-home field). */
export const LINE_STEP_S = 30 * 60
export const LINE_MAX_S = 90 * 60

export function useWalkBackM(): number | null {
  const assumptions = useData((s) => s.assumptions)
  return assumptions.find((a) => a.key === 'walk_back_max_m')?.value ?? null
}

/** Rings as GeoJSON polygons (outlines are drawn), each with its radius. */
export function useRings() {
  const stations = useData((s) => s.stations)
  const loaded = useData((s) => s.loaded)
  const walkBackM = useWalkBackM()
  const base = stations[0]
  return useMemo(() => {
    if (!loaded || !base) return []
    const radii = RING_KM.map((km) => ({ m: km * 1000, limit: false }))
    if (walkBackM) radii.push({ m: walkBackM, limit: true })
    return radii
      .map((r) => ({ ...r, ring: uncertaintyRing(base, r.m) }))
      .filter((r): r is { m: number; limit: boolean; ring: Feature<Polygon> } => r.ring !== null)
  }, [loaded, base, walkBackM])
}

/** The walk-time contours of the current walk-home field, or null before the field arrives. */
export function useLines() {
  const grid = useData((s) => s.grid)
  const version = usePlan((s) => s.walkHomeVersion)
  return useMemo(() => {
    const field = getWalkHomeField()
    if (!grid || !field || version === 0) return null
    return walkTimeLines(field, grid.meta.width, grid.meta.height, LINE_STEP_S, LINE_MAX_S)
  }, [grid, version])
}

/** Labels for the rings (at their north point) or lines (at their northernmost cell), for MapLabels. */
export function useReachLabels(): LabelItem[] {
  const reach = useView((s) => s.reach)
  const grid = useData((s) => s.grid)
  const rings = useRings()
  const lines = useLines()
  return useMemo(() => {
    if (reach === 'distance') {
      return rings.map((r) => {
        const north = r.ring.geometry.coordinates[0][0] // first ring point is due north
        const km = r.m / 1000
        return {
          id: `reach-ring-${r.m}`,
          lon: north[0],
          lat: north[1],
          text: r.limit ? `${km} km walk-back limit` : `${km} km`,
        }
      })
    }
    if (reach === 'time' && grid && lines) {
      const items: LabelItem[] = []
      lines.labelCell.forEach((cell, k) => {
        if (cell === null || k === 0) return
        const p = cellToLatLon(grid.meta, Math.floor(cell / grid.meta.width), cell % grid.meta.width)
        items.push({ id: `reach-line-${k}`, lat: p.lat, lon: p.lon, text: `${(k * LINE_STEP_S) / 60} min walk home` })
      })
      return items
    }
    return []
  }, [reach, grid, rings, lines])
}
