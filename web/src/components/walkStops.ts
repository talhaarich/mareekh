import { create } from 'zustand'
import { insertStops } from '../lib/stopOrder'
import type { Station } from '../state/data'

/**
 * Which destinations the walk visits. Every station in stations.json is a destination. Default (EVA-1):
 * the rover stops, i.e. stations with a sol, in file (walking) order. Mapped features (no sol) are
 * optional; an added one is fitted in where it adds the least distance (lib/stopOrder.ts), so the EVA-1
 * order is kept. Interface state: it only chooses which stations go to the planner, and in what order.
 */

/** Ids in the default walk: every station Perseverance stood at (has a sol). Base is always in. */
export function defaultStops(stations: Station[]): string[] {
  return stations.slice(1).filter((s) => s.sol !== null).map((s) => s.id)
}

/**
 * Base, then the chosen stations in walking order: rover stops in file order, other stops fitted in
 * where they add the least `dist`. `included` null means the default.
 */
export function walkStations(
  stations: Station[],
  included: string[] | null,
  dist: (a: Station, b: Station) => number,
): Station[] {
  if (stations.length === 0) return []
  const chosen = new Set(included ?? defaultStops(stations))
  const picked = stations.slice(1).filter((s) => chosen.has(s.id))
  const core = picked.filter((s) => s.sol !== null)
  const extras = picked.filter((s) => s.sol === null)
  return insertStops([stations[0], ...core], extras, dist)
}

/** The choice after toggling `id`. The last stop cannot be removed: a walk needs somewhere to go. */
export function toggleStop(stations: Station[], included: string[] | null, id: string): string[] {
  const current = included ?? defaultStops(stations)
  if (current.includes(id)) return current.length > 1 ? current.filter((x) => x !== id) : current
  const order = stations.map((s) => s.id)
  return [...current, id].sort((a, b) => order.indexOf(a) - order.indexOf(b))
}

interface WalkStopsState {
  /** Chosen station ids, or null for the default (EVA-1). */
  included: string[] | null
  toggle: (stations: Station[], id: string) => void
  reset: () => void
}

export const useWalkStops = create<WalkStopsState>()((set, get) => ({
  included: null,
  toggle: (stations, id) => set({ included: toggleStop(stations, get().included, id) }),
  reset: () => set({ included: null }),
}))
