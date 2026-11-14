import { create } from 'zustand'

/**
 * Ephemeral pointer state shared between my own components (leg table <-> map, markers <-> card).
 * Not part of the shared app state in PLANNER_API.md: nothing outside components/ and map/ reads it,
 * and it is never saved.
 */
interface InteractionState {
  /** Index into PlanResult.legs of the row under the pointer, or null. */
  hoverLeg: number | null
  /** Station whose card is open, or null. */
  selectedStationId: string | null
  setHoverLeg: (i: number | null) => void
  selectStation: (id: string | null) => void
}

export const useInteraction = create<InteractionState>()((set) => ({
  hoverLeg: null,
  selectedStationId: null,
  setHoverLeg: (i) => set({ hoverLeg: i }),
  selectStation: (id) => set({ selectedStationId: id }),
}))
