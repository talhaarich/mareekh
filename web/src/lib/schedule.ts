/**
 * The planned schedule for the route card: when the crew reaches and leaves each station.
 * Read straight off the walk timeline (lib/timeline.ts), so the times match the plan and the
 * simulated walk exactly. Nothing here sums legs again.
 */

import type { TimelinePoint } from './timeline'

export interface StationStop {
  stationId: string
  /** Seconds since leaving base when the crew arrives. 0 for base at the start. */
  arriveS: number
  /** Seconds since leaving base when the crew leaves (arrival plus dwell). Equal to arriveS with no dwell. */
  departS: number
}

/**
 * One entry per station visit, in walking order: base first, each station, base again at the end.
 * A walk that stops early (a leg with no route) ends at the last station it reaches.
 */
export function stationSchedule(timeline: TimelinePoint[]): StationStop[] {
  const stops: StationStop[] = []
  let previousWasStation = false
  for (const p of timeline) {
    if (p.stationId === null) {
      previousWasStation = false
      continue
    }
    const last = stops[stops.length - 1]
    if (previousWasStation && last && last.stationId === p.stationId) {
      last.departS = p.elapsedS // the departure point after the dwell
    } else {
      stops.push({ stationId: p.stationId, arriveS: p.elapsedS, departS: p.elapsedS })
    }
    previousWasStation = true
  }
  return stops
}
