/**
 * Helper functions the interface may call, with the exact signatures in docs/specs/PLANNER_API.md.
 * They use the loaded grid and assumptions from the `data` slice, so the interface never needs them.
 * Each throws if called before data has loaded (check `useData().loaded` first).
 */

import { assumptionValue, useData } from '../state/data'
import * as grid from './grid'
import * as mars from './mars'
import type { LatLon } from './mars'

export { walkHomeS } from '../state/plan'

function loadedGrid(): grid.Grid {
  const g = useData.getState().grid
  if (!g) throw new Error('Grid not loaded yet')
  return g
}

/** Centre of a cell, in degrees. */
export function cellToLatLon(row: number, col: number): LatLon {
  return grid.cellToLatLon(loadedGrid().meta, row, col)
}

/** The cell containing a point; null outside the grid. */
export function latLonToCell(p: LatLon): { row: number; col: number } | null {
  return grid.latLonToCell(loadedGrid().meta, p)
}

/** Height (m) and slope (degrees) at a point; null outside the grid or on no data. */
export function sample(p: LatLon): { heightM: number; slopeDeg: number } | null {
  return grid.sample(loadedGrid(), p)
}

/** Distance on Mars in metres, using mars_radius_m. Never use MapLibre's distance tools (they assume Earth). */
export function distanceM(a: LatLon, b: LatLon): number {
  return mars.distanceM(a, b, assumptionValue(useData.getState().assumptions, 'mars_radius_m'))
}

/** Bearing in degrees clockwise from north, 0 to 360. */
export function bearingDeg(from: LatLon, to: LatLon): number {
  return mars.bearingDeg(from, to)
}
