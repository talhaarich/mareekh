/**
 * The camera path for flying into the ground view: a pure function of where the camera is, where the eye
 * should end up and the ground heights in between, so it can be tested without a map.
 *
 * Three parts, so the camera never passes through or skims the ground:
 * 1. climb straight up on the spot to the cruise height (only if the camera starts lower),
 * 2. cross to the destination no lower than the cruise height,
 * 3. descend straight down onto the eye point, the last part of the flight only.
 * The cruise height is at least `clearanceM` above the highest ground sampled along the straight line.
 * Heights and altitudes are Mars metres in the height grid's datum (convert with groundScale before MapLibre).
 */

import { bearingDeg, type LatLon } from '../lib/mars'

/** A camera position: altitude in Mars metres, same datum as the height grid. */
export interface Eye extends LatLon {
  altM: number
}

/** Where the camera faces: bearing clockwise from north, pitch 0 straight down to 90 at the horizon. */
export interface Look {
  bearingDeg: number
  pitchDeg: number
}

export interface FlightOptions {
  /** Ground height at a point in Mars metres; null where unknown (outside the grid, no data). */
  heightAt: (p: LatLon) => number | null
  /** Straight-line distance on Mars in metres. */
  distanceM: (a: LatLon, b: LatLon) => number
  /** Cruise at least this far above the highest ground on the line, metres. */
  clearanceM: number
  /** Spacing of the height samples along the line, metres. */
  stepM: number
  /** Pitch while crossing, degrees. */
  cruisePitchDeg: number
}

export interface FlightPlan {
  start: Eye
  end: Eye
  startLook: Look
  endLook: Look
  /** Highest ground found on the line, Mars metres; -Infinity if no sample had a height. */
  maxGroundM: number
  cruiseAltM: number
  /** Start and end are the same place: no climb or crossing, only the height and the view change. */
  samePlace: boolean
  /** Bearing from start to end; the end bearing when they are the same place. */
  travelBearingDeg: number
  cruisePitchDeg: number
  /** Fractions of the flight time where the climb ends and the descent starts. */
  climbEnd: number
  descentStart: number
}

/** Fraction of the flight spent climbing (when needed) and descending. Display choices. */
const CLIMB_SHARE = 0.2
const DESCENT_SHARE = 0.3
/** Fraction of the flight over which the view turns from where it started to the travel direction. */
const TURN_SHARE = 0.25
/** Closer than this (metres), start and end count as the same place: no crossing. */
const SAME_PLACE_M = 1
/** Altitude differences below this (metres) need no climb or descent phase. */
const LEVEL_M = 0.5

function lerp(a: number, b: number, k: number): number {
  return a + (b - a) * k
}

function smooth(k: number): number {
  const c = Math.min(1, Math.max(0, k))
  return c * c * (3 - 2 * c)
}

/** Bearing between a and b the short way round, 0 to 360. */
function lerpBearing(a: number, b: number, k: number): number {
  const d = ((((b - a) % 360) + 540) % 360) - 180
  return (((a + d * k) % 360) + 360) % 360
}

/** Plans the flight from `start` (looking along `startLook`) to `end` (looking along `endLook`). */
export function planFlight(start: Eye, startLook: Look, end: Eye, endLook: Look, o: FlightOptions): FlightPlan {
  const distM = o.distanceM(start, end)
  const samePlace = !(distM >= SAME_PLACE_M)
  const n = samePlace ? 0 : Math.max(1, Math.ceil(distM / o.stepM))
  let maxGroundM = -Infinity
  for (let i = 0; i <= n; i++) {
    const k = n === 0 ? 1 : i / n
    const h = o.heightAt({ lat: lerp(start.lat, end.lat, k), lon: lerp(start.lon, end.lon, k) })
    if (h !== null && Number.isFinite(h)) maxGroundM = Math.max(maxGroundM, h)
  }
  const cruiseAltM = samePlace ? end.altM : Math.max(maxGroundM + o.clearanceM, end.altM)
  const climbEnd = !samePlace && start.altM < cruiseAltM - LEVEL_M ? CLIMB_SHARE : 0
  const descentStart = !samePlace && end.altM < cruiseAltM - LEVEL_M ? 1 - DESCENT_SHARE : 1
  return {
    start,
    end,
    startLook,
    endLook,
    maxGroundM,
    cruiseAltM,
    samePlace,
    travelBearingDeg: samePlace ? endLook.bearingDeg : bearingDeg(start, end),
    cruisePitchDeg: o.cruisePitchDeg,
    climbEnd,
    descentStart,
  }
}

/** Camera position and view at `t`, 0 (start) to 1 (end) of the flight. */
export function flightAt(plan: FlightPlan, t: number): Eye & Look {
  const { start, end, startLook, endLook, cruiseAltM, climbEnd, descentStart } = plan
  const tc = Math.min(1, Math.max(0, t))

  // Same place: only the height and the view change.
  if (plan.samePlace) {
    const k = smooth(tc)
    return {
      lat: lerp(start.lat, end.lat, k),
      lon: lerp(start.lon, end.lon, k),
      altM: lerp(start.altM, end.altM, k),
      bearingDeg: lerpBearing(startLook.bearingDeg, endLook.bearingDeg, k),
      pitchDeg: lerp(startLook.pitchDeg, endLook.pitchDeg, k),
    }
  }

  let u: number // fraction of the way across
  let altM: number
  // Where the crossing starts: the start altitude if above the cruise height, else the cruise height.
  const crossFromM = Math.max(start.altM, cruiseAltM)
  if (tc < climbEnd) {
    u = 0
    altM = lerp(start.altM, cruiseAltM, smooth(tc / climbEnd))
  } else if (tc < descentStart) {
    u = smooth((tc - climbEnd) / (descentStart - climbEnd))
    altM = lerp(crossFromM, cruiseAltM, u) // never below the cruise height while crossing
  } else {
    u = 1
    const k = descentStart < 1 ? smooth((tc - descentStart) / (1 - descentStart)) : 1
    altM = lerp(cruiseAltM, end.altM, k)
  }

  // View: turn to the travel direction at the start, to the final view during the descent.
  const turnIn = smooth(tc / TURN_SHARE)
  const settle = descentStart < 1 ? smooth((tc - descentStart) / (1 - descentStart)) : smooth((tc - (1 - TURN_SHARE)) / TURN_SHARE)
  const midBearing = lerpBearing(startLook.bearingDeg, plan.travelBearingDeg, turnIn)
  const midPitch = lerp(startLook.pitchDeg, plan.cruisePitchDeg, turnIn)

  return {
    lat: lerp(start.lat, end.lat, u),
    lon: lerp(start.lon, end.lon, u),
    altM,
    bearingDeg: lerpBearing(midBearing, endLook.bearingDeg, settle),
    pitchDeg: lerp(midPitch, endLook.pitchDeg, settle),
  }
}
