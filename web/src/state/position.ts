/**
 * The `position` slice (docs/specs/PLANNER_API.md), written only here. Base is the origin.
 * The position is simulated: it moves along the planned route at modelled speed, and the
 * interface must label it as simulated. Uncertainty grows with distance walked since the last fix
 * (`drift_fraction` from assumptions.json); a fix at a landmark snaps to it, resets that, and is logged.
 *
 * The interface drives the clock (play speed is a display choice): call `simulateTo` or `advance`.
 */

import { create } from 'zustand'
import type { LatLon } from '../lib/mars'
import { pointAt, walkTimeline, type TimelinePoint } from '../lib/timeline'
import { assumptionValue, useData } from './data'
import { usePlan } from './plan'

export interface Fix {
  stationId: string
  elapsedS: number
}

interface PositionState {
  estimate: LatLon
  /** Metres: drift_fraction x sinceFixM. */
  uncertaintyM: number
  /** 3D metres walked since the last fix (or since base). */
  sinceFixM: number
  /** Seconds since leaving base. */
  elapsedS: number
  simulated: true
  fixes: Fix[]
  /** Back to base: elapsed 0, no uncertainty, fix log cleared. */
  reset: () => void
  /** Moves the simulated walk to `elapsedS` along the current plan (clamped to its start and end). */
  simulateTo: (elapsedS: number) => void
  /** Moves the simulated walk on by `dtS` seconds. */
  advance: (dtS: number) => void
  /** The crew confirms they are at this station: snap to it, reset uncertainty, log the fix. */
  fixAt: (stationId: string) => void
}

/** Base from the loaded stations (the first is base). NaN until data has loaded. */
function base(): LatLon {
  const b = useData.getState().stations[0]
  return b ? { lat: b.lat, lon: b.lon } : { lat: NaN, lon: NaN }
}

// The timeline is rebuilt only when the plan result changes.
let cache: { result: unknown; timeline: TimelinePoint[] } = { result: null, timeline: [] }
function timeline(): TimelinePoint[] {
  const result = usePlan.getState().result
  if (result !== cache.result) {
    const { grid, assumptions, stations } = useData.getState()
    cache = { result, timeline: result && grid ? walkTimeline(grid, assumptions, stations, result) : [] }
  }
  return cache.timeline
}

// Distance along the route at the last fix; sinceFixM is measured from here.
let alongAtFixM = 0

export const usePosition = create<PositionState>()((set, get) => ({
  estimate: base(),
  uncertaintyM: 0,
  sinceFixM: 0,
  elapsedS: 0,
  simulated: true,
  fixes: [],

  reset: () => {
    alongAtFixM = 0
    set({ estimate: base(), uncertaintyM: 0, sinceFixM: 0, elapsedS: 0, fixes: [] })
  },

  simulateTo: (elapsedS) => {
    const t = timeline()
    if (t.length === 0) return // no plan yet, or the walk cannot leave base
    const p = pointAt(t, elapsedS)
    const sinceFixM = Math.max(0, p.distanceAlongM - alongAtFixM)
    const drift = assumptionValue(useData.getState().assumptions, 'drift_fraction')
    set({ estimate: p.position, elapsedS: p.elapsedS, sinceFixM, uncertaintyM: drift * sinceFixM })
  },

  advance: (dtS) => get().simulateTo(get().elapsedS + dtS),

  fixAt: (stationId) => {
    const station = useData.getState().stations.find((s) => s.id === stationId)
    if (!station) throw new Error(`No station "${stationId}"`)
    const t = timeline()
    alongAtFixM = t.length > 0 ? pointAt(t, get().elapsedS).distanceAlongM : 0
    set((s) => ({
      estimate: { lat: station.lat, lon: station.lon },
      uncertaintyM: 0,
      sinceFixM: 0,
      fixes: [...s.fixes, { stationId, elapsedS: s.elapsedS }],
    }))
  },
}))

/**
 * Station to prompt a fix at, or null: the walk is at a station (arriving or working there) and has
 * drifted since the last fix. Use as a selector: `usePosition(selectFixPrompt)`.
 */
export function selectFixPrompt(state: Pick<PositionState, 'elapsedS' | 'uncertaintyM'>): string | null {
  if (!(state.uncertaintyM > 0)) return null
  const t = timeline()
  return t.length > 0 ? pointAt(t, state.elapsedS).stationId : null
}

// Put the estimate on base once stations have loaded (it is NaN before that).
useData.subscribe((s, prev) => {
  if (s.loaded && !prev.loaded) usePosition.getState().reset()
})
