/**
 * Cost of one step between neighbouring cells: blocked or not, and walking time in seconds.
 * Design: docs/HOW_IT_WORKS.md section 4. The cost grid is never a file; it is built here from
 * slope.bin, the slope limit and the speed model, so sliders work without the pipeline.
 *
 * vmax comes from assumptions.json. The curve's two shape numbers are named constants below
 * for now; they move into assumptions.json in their own pull request.
 */

import { cellIndex, type Grid, type GridMeta } from './grid'
import { assumptionValue, type Assumption } from '../state/data'

/** Hiking-speed curve, scaled so walking on flat ground is exactly `vmaxMs`. */
export interface SpeedModel {
  /** Flat-ground walking speed, m/s. */
  vmaxMs: number
  /** How fast speed falls away from the optimum grade (the 3.5 in Tobler's formula). Per unit grade. */
  decay: number
  /** Grade walked fastest, rise/run, negative = downhill (the 0.05 in Tobler's |grade + 0.05|, as -0.05). */
  optimumGrade: number
}

/**
 * Which assumption is vmax. The walk is several hours through four stations, so the long-walk speed
 * applies. The interface should show this key's own unit and source next to any time it displays.
 */
export const VMAX_KEY = 'walk_speed_long_ms'

/** vmax in m/s, from assumptions.json. */
export function vmaxFromAssumptions(assumptions: Assumption[]): number {
  return assumptionValue(assumptions, VMAX_KEY)
}

/**
 * Tobler's hiking function, v = 6 * exp(-3.5 * |grade + 0.05|) km/h (Tobler 1993, NCGIA Technical Report 93-1).
 * Only its shape is used; the speed itself is rescaled to vmax. Temporary: these move into assumptions.json.
 */
export const TOBLER_DECAY = 3.5
export const TOBLER_OPTIMUM_GRADE = -0.05

/** The speed model the planner uses. Do not tune it to make a plan come out GO. */
export function speedModelFromAssumptions(assumptions: Assumption[]): SpeedModel {
  return { vmaxMs: vmaxFromAssumptions(assumptions), decay: TOBLER_DECAY, optimumGrade: TOBLER_OPTIMUM_GRADE }
}

/**
 * Walking speed in m/s on a grade (rise / flat run, uphill positive).
 * v = vmax * exp(-decay * (|grade - optimum| - |optimum|)): exactly vmax on flat ground,
 * fastest on a slight downhill, falling fast on steep grades either way.
 */
export function walkSpeedMs(grade: number, model: SpeedModel): number {
  const { vmaxMs, decay, optimumGrade } = model
  return vmaxMs * Math.exp(-decay * (Math.abs(grade - optimumGrade) - Math.abs(optimumGrade)))
}

/** The eight neighbours of a cell. `flatFactor` times res_m is the flat distance to it. */
export const NEIGHBOURS: readonly { dr: number; dc: number; flatFactor: number }[] = [
  { dr: -1, dc: 0, flatFactor: 1 },
  { dr: 1, dc: 0, flatFactor: 1 },
  { dr: 0, dc: -1, flatFactor: 1 },
  { dr: 0, dc: 1, flatFactor: 1 },
  { dr: -1, dc: -1, flatFactor: Math.SQRT2 },
  { dr: -1, dc: 1, flatFactor: Math.SQRT2 },
  { dr: 1, dc: -1, flatFactor: Math.SQRT2 },
  { dr: 1, dc: 1, flatFactor: Math.SQRT2 },
]

/** Index of neighbour `k` (into NEIGHBOURS) of a cell, or -1 when it is off the grid. */
export function neighbourIndex(meta: GridMeta, row: number, col: number, k: number): number {
  const r = row + NEIGHBOURS[k].dr
  const c = col + NEIGHBOURS[k].dc
  if (r < 0 || r >= meta.height || c < 0 || c >= meta.width) return -1
  return cellIndex(meta, r, c)
}

/**
 * Cells that cannot be entered: slope over the limit (degrees), or no data in either grid.
 * 1 = blocked, 0 = open. A slope exactly at the limit is open.
 */
export function blockedMask(grid: Grid, slopeLimitDeg: number): Uint8Array {
  const { dem, slope, meta } = grid
  const out = new Uint8Array(dem.length)
  for (let i = 0; i < dem.length; i++) {
    const s = slope[i]
    out[i] = s === meta.nodata || dem[i] === meta.nodata || !(s <= slopeLimitDeg) ? 1 : 0
  }
  return out
}

/**
 * Seconds to walk from cell `from` into neighbouring cell `to`, `flatM` metres apart on the map.
 * Infinity when `to` is blocked or `from` has no height. Not symmetric: uphill and downhill differ.
 * Time = 3D step length / speed on the step's grade.
 */
export function stepTimeS(grid: Grid, blocked: Uint8Array, model: SpeedModel, from: number, to: number, flatM: number): number {
  if (blocked[to] || grid.dem[from] === grid.meta.nodata) return Infinity
  const riseM = grid.dem[to] - grid.dem[from]
  const lengthM = Math.hypot(flatM, riseM)
  return lengthM / walkSpeedMs(riseM / flatM, model)
}
