/**
 * Flying from one station to the next, and the 2D/3D terrain transition: pure maths, no map.
 * Every number here is a display choice (how the flight looks), not data.
 */

import type { LatLon } from '../lib/mars'

/** 2D: zoom to at least this when flying to a station. */
export const STATION_ZOOM_2D = 14.5
/** 3D: zoom and pitch on arrival, looking along the leg you came from. */
export const STATION_ZOOM_3D = 14.8
export const STATION_PITCH_3D = 62
/** Flight time grows with distance, between these bounds (milliseconds; per km of ground). */
export const FLY_MS_MIN = 1400
export const FLY_MS_MAX = 4000
export const FLY_MS_PER_KM = 700
/** Closer than this (metres), "from" gives no direction: keep the current bearing. */
const SAME_PLACE_M = 50
/** Tour: seconds to stay at each station before flying on. */
export const TOUR_DWELL_MS = 2000
/** 2D to 3D: the terrain rises from flat over the camera flight; 3D to 2D: it flattens while the camera levels. */
export const TERRAIN_RISE_MS = 2200
export const TERRAIN_FLATTEN_MS = 900
/** Exaggeration used for "flat" (MapLibre needs terrain to exist while it rises or flattens). */
export const FLAT_EXAGGERATION = 0.02

/**
 * Station ids in walking order: base, then each leg's destination, as the plan has it (the return to
 * base is not repeated). With no plan, the station list order.
 */
export function walkOrder(stationIds: string[], legs: { fromId: string; toId: string }[] | null | undefined): string[] {
  if (!legs || legs.length === 0) return stationIds
  const out = [legs[0].fromId]
  for (const l of legs) if (!out.includes(l.toId)) out.push(l.toId)
  return out
}

/** The stop before (-1) or after (+1) `id` in `order`, wrapping round; `order[0]` if `id` is not in it. */
export function stepStop(order: string[], id: string | null, dir: 1 | -1): string | null {
  if (order.length === 0) return null
  const i = id === null ? -1 : order.indexOf(id)
  if (i < 0) return order[0]
  return order[(i + dir + order.length) % order.length]
}

export interface CameraTarget {
  center: [number, number]
  zoom: number
  pitch: number
  bearing: number
  duration: number
}

/** Flight time for a ground distance, milliseconds. */
export function flyDurationMs(distanceM: number): number {
  return Math.round(Math.min(FLY_MS_MAX, Math.max(FLY_MS_MIN, FLY_MS_MIN + (distanceM / 1000) * FLY_MS_PER_KM)))
}

/**
 * Camera for arriving at `to`. In 2D: straight down, the current bearing, zoomed in to at least
 * STATION_ZOOM_2D. In 3D: pitched, facing the way you travelled (bearing from `from` to `to`), or the
 * current bearing when there is no `from` or it is the same place.
 */
export function stationCamera(o: {
  to: LatLon
  from: LatLon | null
  terrain3d: boolean
  currentZoom: number
  currentBearing: number
  distanceM: (a: LatLon, b: LatLon) => number
  bearingDeg: (a: LatLon, b: LatLon) => number
}): CameraTarget {
  const dist = o.from ? o.distanceM(o.from, o.to) : 0
  const center: [number, number] = [o.to.lon, o.to.lat]
  if (!o.terrain3d) {
    return { center, zoom: Math.max(o.currentZoom, STATION_ZOOM_2D), pitch: 0, bearing: o.currentBearing, duration: flyDurationMs(dist) }
  }
  const bearing = o.from && dist >= SAME_PLACE_M ? o.bearingDeg(o.from, o.to) : o.currentBearing
  return { center, zoom: STATION_ZOOM_3D, pitch: STATION_PITCH_3D, bearing, duration: flyDurationMs(dist) }
}

/** Eased value from `a` to `b` at `t` (0 to 1, clamped): slow start and end. */
export function ease(a: number, b: number, t: number): number {
  const c = Math.min(1, Math.max(0, t))
  const k = c * c * (3 - 2 * c)
  return a + (b - a) * k
}

/**
 * Pixel offset that puts a flight's target in the middle of the map area left free by panels: positive x
 * moves it right. `covered` is how far each edge is covered, pixels.
 */
export function freeAreaOffset(covered: { top: number; right: number; bottom: number; left: number }): [number, number] {
  return [(covered.left - covered.right) / 2, (covered.top - covered.bottom) / 2]
}
