/**
 * The next station on the planned route from where you stand: the 3D ground view faces it and shows
 * its range and bearing. Pure, so it can be tested without a scene.
 */

import type { Leg } from '../lib/plan'
import type { LatLon } from '../lib/mars'

/**
 * Id of the next station on the planned route, or null when there is no plan to follow (face north).
 * - Standing at a station in the walk (base included): the station its leg goes to. From base, the walk's first station.
 * - Anywhere else: the station at the end of the leg whose route passes closest.
 */
export function nextStationId(
  legs: Pick<Leg, 'fromId' | 'toId' | 'ok' | 'path'>[] | null | undefined,
  at: LatLon,
  stationId: string | null,
  distanceM: (a: LatLon, b: LatLon) => number,
): string | null {
  if (!legs || legs.length === 0) return null
  if (stationId !== null) {
    const leg = legs.find((l) => l.fromId === stationId)
    if (leg) return leg.toId
  }
  let best: string | null = null
  let bestM = Infinity
  for (const leg of legs) {
    if (!leg.ok) continue
    for (const p of leg.path) {
      const d = distanceM(at, p)
      if (d < bestM) {
        bestM = d
        best = leg.toId
      }
    }
  }
  return best
}
