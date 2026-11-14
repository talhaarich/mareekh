/**
 * The full walk: one route search per leg (base -> S1 -> ... -> last station -> base), totals, status,
 * the walk-home field and the turn-back point. Shapes and rules: docs/specs/PLANNER_API.md.
 * Energy, dose and status: docs/HOW_IT_WORKS.md section 4. Every number comes from assumptions.json.
 *
 * Team decisions (Talha):
 * - The worker loads the grid and assumptions itself and awaits them before any message.
 * - Distances are the 3D length walked, the same length the times come from ("Walked distance").
 * - A leg with no path has Infinity for its numbers, so the totals are Infinity too; working legs
 *   keep their real numbers. turnBack is null and the reason names the failed leg.
 *   The interface shows Infinity as "—".
 */

import { assumptionValue, type Assumption, type Station } from '../state/data'
import { blockedMask, speedModelFromAssumptions, stepTimeS, type SpeedModel } from './cost'
import { cellToLatLon, latLonToCell, type Grid } from './grid'
import type { LatLon } from './mars'
import { findRoute, search } from './route'

export interface PlanParams {
  /** Default from assumptions: slope_limit_plan_deg. */
  slopeLimitDeg: number
  /** Equipment carried, 0 to 40 kg. */
  carriedKg: number
  /** Default from assumptions: eva_time_limit_s. */
  timeLimitS: number
}

export interface Leg {
  fromId: string
  toId: string
  /** False when no path exists under the slope limit. */
  ok: boolean
  distanceM: number
  timeS: number
  climbM: number
  energyKJ: number
  /** Empty when ok is false. */
  path: LatLon[]
}

export interface PlanResult {
  /** Every leg ok. */
  ok: boolean
  status: 'go' | 'caution' | 'nogo'
  /** One sentence for the status pill. */
  reason: string
  /** Base to S1, ..., last station to base. */
  legs: Leg[]
  distanceM: number
  movingTimeS: number
  stationTimeS: number
  totalTimeS: number
  /** timeLimitS minus totalTimeS, may be negative. */
  spareS: number
  energyKJ: number
  doseMSv: number
  turnBack: null | { position: LatLon; distanceAlongM: number; elapsedS: number }
}

/** Seconds as "5 h 40 min" or "35 min", rounded to the minute. For the status sentence only. */
export function formatDuration(seconds: number): string {
  const totalMin = Math.round(Math.abs(seconds) / 60)
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  return h > 0 ? `${h} h ${m} min` : `${m} min`
}

/** One step between neighbouring cells: seconds, 3D metres and rise in metres. */
function step(grid: Grid, blocked: Uint8Array, model: SpeedModel, a: number, b: number) {
  const w = grid.meta.width
  const diagonal = Math.floor(a / w) !== Math.floor(b / w) && a % w !== b % w
  const flatM = grid.meta.resM * (diagonal ? Math.SQRT2 : 1)
  const riseM = grid.dem[b] - grid.dem[a]
  return { timeS: stepTimeS(grid, blocked, model, a, b, flatM), lengthM: Math.hypot(flatM, riseM), riseM }
}

/** Seconds to walk to `base` from every cell, by walking time. Infinity when unreachable or when base is off the grid. */
export function walkHomeTimes(grid: Grid, assumptions: Assumption[], base: LatLon, params: PlanParams): Float64Array {
  const cell = latLonToCell(grid.meta, base)
  if (!cell) return new Float64Array(grid.dem.length).fill(Infinity)
  const blocked = blockedMask(grid, params.slopeLimitDeg)
  const model = speedModelFromAssumptions(assumptions)
  return search(grid, blocked, model, cell.row * grid.meta.width + cell.col, { reverse: true }).timeS
}

/** The walk-home field as the worker sends it: Float32, grid layout, Infinity when unreachable. */
export function walkHomeField(grid: Grid, assumptions: Assumption[], base: LatLon, params: PlanParams): Float32Array {
  return Float32Array.from(walkHomeTimes(grid, assumptions, base, params))
}

interface RoutePoint {
  cell: number
  position: LatLon
  distanceAlongM: number
  elapsedS: number
}

/** Plans the whole walk. `stations` is in walking order and starts with base. */
export function planWalk(grid: Grid, assumptions: Assumption[], stations: Station[], params: PlanParams): PlanResult {
  if (stations.length < 2) throw new Error('A plan needs base and at least one station')
  const a = (key: string) => assumptionValue(assumptions, key)
  const walkKJperS = a('work_rate_walk_kj_h') / 3600
  const stationKJperS = a('work_rate_station_kj_h') / 3600
  const liftN = (a('suited_mass_kg') + params.carriedKg) * a('mars_gravity_ms2')
  const doseMSvPerS = a('dose_rate_msv_h') / 3600
  const cautionSpareS = a('caution_spare_s')
  const reserveS = a('turnback_reserve_s')

  const model = speedModelFromAssumptions(assumptions)
  const blocked = blockedMask(grid, params.slopeLimitDeg)
  const w = grid.meta.width
  const cells = stations.map((s) => {
    const c = latLonToCell(grid.meta, s)
    return c ? c.row * w + c.col : -1
  })
  const base = stations[0]
  const home = walkHomeTimes(grid, assumptions, base, params)

  const legs: Leg[] = []
  const points: RoutePoint[] = [{ cell: cells[0], position: { lat: base.lat, lon: base.lon }, distanceAlongM: 0, elapsedS: 0 }]
  let reachable = cells[0] >= 0 // false once a leg fails: later points are not on a walk that can happen
  let failReason = ''

  for (let i = 0; i < stations.length; i++) {
    const fromI = i
    const toI = (i + 1) % stations.length
    const from = stations[fromI]
    const to = stations[toI]
    const route = cells[fromI] >= 0 && cells[toI] >= 0 ? findRoute(grid, blocked, model, cells[fromI], cells[toI]) : null

    if (!route || !route.ok) {
      legs.push({ fromId: from.id, toId: to.id, ok: false, distanceM: Infinity, timeS: Infinity, climbM: Infinity, energyKJ: Infinity, path: [] })
      if (!failReason) {
        const outside = cells[fromI] < 0 ? from : cells[toI] < 0 ? to : null
        failReason = outside
          ? `No route from ${from.id} to ${to.id}: ${outside.id} is outside the map.`
          : `No route from ${from.id} to ${to.id} under ${params.slopeLimitDeg}°.`
      }
      reachable = false
      continue
    }

    let distanceM = 0
    let climbM = 0
    const path: LatLon[] = [{ lat: from.lat, lon: from.lon }]
    for (let j = 1; j < route.cells.length; j++) {
      const s = step(grid, blocked, model, route.cells[j - 1], route.cells[j])
      distanceM += s.lengthM
      if (s.riseM > 0) climbM += s.riseM
      const centre = cellToLatLon(grid.meta, Math.floor(route.cells[j] / w), route.cells[j] % w)
      path.push(centre)
      if (reachable) {
        const prev = points[points.length - 1]
        points.push({ cell: route.cells[j], position: centre, distanceAlongM: prev.distanceAlongM + s.lengthM, elapsedS: prev.elapsedS + s.timeS })
      }
    }
    path.push({ lat: to.lat, lon: to.lon })
    legs.push({
      fromId: from.id,
      toId: to.id,
      ok: true,
      distanceM,
      timeS: route.timeS,
      climbM,
      energyKJ: route.timeS * walkKJperS + (liftN * climbM) / 1000,
      path,
    })

    if (reachable) {
      // Arrive at the station's own position, then (except back at base) spend its dwell time there.
      const arrival = points[points.length - 1]
      points[points.length - 1] = { ...arrival, position: { lat: to.lat, lon: to.lon } }
      if (toI !== 0) points.push({ ...points[points.length - 1], elapsedS: arrival.elapsedS + to.dwellS })
    }
  }

  const ok = legs.every((l) => l.ok)
  const sum = (f: (l: Leg) => number) => legs.reduce((t, l) => t + f(l), 0)
  const stationTimeS = stations.reduce((t, s) => t + s.dwellS, 0)
  const movingTimeS = sum((l) => l.timeS)
  const totalTimeS = movingTimeS + stationTimeS
  const spareS = params.timeLimitS - totalTimeS

  let status: PlanResult['status']
  let reason: string
  if (!ok) {
    status = 'nogo'
    reason = failReason
  } else if (spareS < 0) {
    status = 'nogo'
    reason = `The walk takes ${formatDuration(totalTimeS)}, ${formatDuration(spareS)} over the ${formatDuration(params.timeLimitS)} limit.`
  } else if (spareS < cautionSpareS) {
    status = 'caution'
    reason = `Only ${formatDuration(spareS)} spare, less than the ${formatDuration(cautionSpareS)} safety margin.`
  } else {
    status = 'go'
    reason = `Fits the ${formatDuration(params.timeLimitS)} limit with ${formatDuration(spareS)} spare.`
  }

  // Turn-back: the last point before the first one from which you can no longer get home in time.
  // Only for a walk where every leg has a route.
  const fits = (p: RoutePoint) => p.cell >= 0 && p.elapsedS + home[p.cell] + reserveS <= params.timeLimitS
  const firstMiss = ok ? points.findIndex((p) => !fits(p)) : -1
  const turnPoint = firstMiss === -1 ? null : points[Math.max(0, firstMiss - 1)]

  return {
    ok,
    status,
    reason,
    legs,
    distanceM: sum((l) => l.distanceM),
    movingTimeS,
    stationTimeS,
    totalTimeS,
    spareS,
    energyKJ: sum((l) => l.energyKJ) + stationTimeS * stationKJperS,
    doseMSv: totalTimeS * doseMSvPerS,
    turnBack: turnPoint && { position: turnPoint.position, distanceAlongM: turnPoint.distanceAlongM, elapsedS: turnPoint.elapsedS },
  }
}
