/**
 * The planned walk as a timeline: every route point with the elapsed time and distance walked when
 * the crew reaches it, including time spent at stations. The simulated walk moves along this.
 * Built from PlanResult legs with the same step maths as the planner, so it ends at exactly
 * result.totalTimeS and result.distanceM.
 */

import type { Assumption, Station } from '../state/data'
import { speedModelFromAssumptions, stepBetween } from './cost'
import { latLonToCell, type Grid } from './grid'
import type { LatLon } from './mars'
import type { PlanResult } from './plan'

export interface TimelinePoint {
  position: LatLon
  /** Seconds since leaving base. */
  elapsedS: number
  /** 3D metres walked since leaving base. */
  distanceAlongM: number
  /** Set on the points at a station (arrival and, after its dwell, departure). */
  stationId: string | null
}

/**
 * Timeline of the walk in `result`. Stops at the first leg with no route, so a NO-GO plan can still be
 * walked as far as it goes. `stations` supplies each station's dwell time, by id.
 */
export function walkTimeline(grid: Grid, assumptions: Assumption[], stations: Station[], result: PlanResult): TimelinePoint[] {
  if (result.legs.length === 0) return []
  const model = speedModelFromAssumptions(assumptions)
  const open = new Uint8Array(grid.dem.length) // the route only enters open cells, so no mask is needed
  const w = grid.meta.width
  const cellOf = (p: LatLon) => {
    const c = latLonToCell(grid.meta, p)
    if (!c) throw new Error('Route point outside the grid')
    return c.row * w + c.col
  }
  const dwell = (id: string) => stations.find((s) => s.id === id)?.dwellS ?? 0

  const first = result.legs[0]
  const points: TimelinePoint[] = []
  if (first.ok) points.push({ position: first.path[0], elapsedS: 0, distanceAlongM: 0, stationId: first.fromId })

  result.legs.forEach((leg, i) => {
    if (!leg.ok || points.length === 0) return
    if (i > 0 && !result.legs[i - 1].ok) return
    let last = points[points.length - 1]
    for (let j = 1; j < leg.path.length; j++) {
      const a = cellOf(leg.path[j - 1])
      const b = cellOf(leg.path[j])
      // A station sits inside its own cell, so stepping between it and its cell centre costs nothing.
      const s = a === b ? { timeS: 0, lengthM: 0 } : stepBetween(grid, open, model, a, b)
      last = { position: leg.path[j], elapsedS: last.elapsedS + s.timeS, distanceAlongM: last.distanceAlongM + s.lengthM, stationId: null }
      points.push(last)
    }
    last.stationId = leg.toId
    const isFinalReturn = i === result.legs.length - 1
    if (!isFinalReturn && dwell(leg.toId) > 0) points.push({ ...last, elapsedS: last.elapsedS + dwell(leg.toId) })
  })
  // A walk that cannot leave base has no timeline worth showing.
  return points.length > 1 ? points : []
}

/** Where the walk is at `elapsedS`, interpolated between points; clamped to the start and end. */
export function pointAt(timeline: TimelinePoint[], elapsedS: number): TimelinePoint {
  if (timeline.length === 0) throw new Error('Empty timeline')
  if (elapsedS <= timeline[0].elapsedS) return timeline[0]
  const end = timeline[timeline.length - 1]
  if (elapsedS >= end.elapsedS) return end
  let lo = 0
  let hi = timeline.length - 1
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    if (timeline[mid].elapsedS <= elapsedS) lo = mid
    else hi = mid
  }
  const a = timeline[lo]
  const b = timeline[hi]
  const f = (elapsedS - a.elapsedS) / (b.elapsedS - a.elapsedS)
  return {
    position: { lat: a.position.lat + f * (b.position.lat - a.position.lat), lon: a.position.lon + f * (b.position.lon - a.position.lon) },
    elapsedS,
    distanceAlongM: a.distanceAlongM + f * (b.distanceAlongM - a.distanceAlongM),
    // At a station while working there (between its arrival and departure points), or exactly on a point.
    stationId: a.stationId !== null && (a.stationId === b.stationId || f === 0) ? a.stationId : null,
  }
}
