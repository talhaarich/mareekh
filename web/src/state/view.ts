import { create } from 'zustand'

/**
 * `view` slice (PLANNER_API.md shared state). Owner: Rafay. Only this file changes it.
 * Holds what the map shows. Nothing here is a route number.
 */
export type Reach = 'off' | 'distance' | 'time'
export type Mode = 'plan' | 'eva'

export interface ViewState {
  /** Layer id of the chosen base view. null = use the manifest default. */
  baseView: string | null
  reach: Reach
  /** Layer id of the chosen data overlay, or null. */
  overlay: string | null
  /** 0 to 1 */
  overlayStrength: number
  showWind: boolean
  showLabels: boolean
  mode: Mode

  setBaseView: (id: string) => void
  /** Returns false (and changes nothing) if it would put two colour fills on at once. */
  setReach: (reach: Reach) => boolean
  /** Returns false (and changes nothing) if it would put two colour fills on at once. */
  setOverlay: (id: string | null) => boolean
  setOverlayStrength: (strength: number) => void
  setShowWind: (on: boolean) => void
  setShowLabels: (on: boolean) => void
  setMode: (mode: Mode) => void
}

/**
 * Two colour fills must never be on together: the walk-time lines and a data overlay.
 * Kept as plain functions so the UI can disable the control before the user clicks.
 */
export function reachBlockedByOverlay(reach: Reach, overlay: string | null): boolean {
  return reach === 'time' && overlay !== null
}

export const useView = create<ViewState>()((set, get) => ({
  baseView: null,
  reach: 'off',
  overlay: null,
  overlayStrength: 0.6,
  showWind: false,
  showLabels: true,
  mode: 'plan',

  setBaseView: (id) => set({ baseView: id }),
  setReach: (reach) => {
    if (reachBlockedByOverlay(reach, get().overlay)) return false
    set({ reach })
    return true
  },
  setOverlay: (id) => {
    if (reachBlockedByOverlay(get().reach, id)) return false
    set({ overlay: id })
    return true
  },
  setOverlayStrength: (strength) => set({ overlayStrength: Math.min(1, Math.max(0, strength)) }),
  setShowWind: (on) => set({ showWind: on }),
  setShowLabels: (on) => set({ showLabels: on }),
  setMode: (mode) => set({ mode }),
}))
