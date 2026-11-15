import { create } from 'zustand'
import type { PinType } from '../state/pins'

/**
 * Ephemeral pointer state shared between my own components (leg table <-> map, markers <-> cards,
 * field notes <-> map). Not part of the shared app state in PLANNER_API.md: nothing outside
 * components/ and map/ reads it, and it is never saved.
 */
interface InteractionState {
  /** Index into PlanResult.legs of the row under the pointer, or null. */
  hoverLeg: number | null
  /** Station whose card is open, or null. */
  selectedStationId: string | null
  /** Pin type the next map click drops, or null when not in drop mode. */
  pinDropType: PinType | null
  /** Pin whose note editor is open, or null. */
  editingPinId: string | null
  /** Where the map should fly next. `seq` changes on every request so the same place can be asked twice. */
  flyTarget: { lat: number; lon: number; seq: number } | null
  /** Walk rehearsal: whether the simulated clock is running, and how many simulated seconds pass per real second. */
  playing: boolean
  playSpeed: number
  /** Map point whose inspector card is open, or null. */
  inspectAt: { lat: number; lon: number } | null

  setHoverLeg: (i: number | null) => void
  /** Opening a station card closes the pin editor: one card over the map at a time. */
  selectStation: (id: string | null) => void
  setPinDropType: (type: PinType | null) => void
  /** Opening a pin editor closes the station card. */
  editPin: (id: string | null) => void
  flyTo: (p: { lat: number; lon: number }) => void
  setPlaying: (on: boolean) => void
  setPlaySpeed: (speed: number) => void
  setInspectAt: (p: { lat: number; lon: number } | null) => void
}

export const useInteraction = create<InteractionState>()((set, get) => ({
  hoverLeg: null,
  selectedStationId: null,
  pinDropType: null,
  editingPinId: null,
  flyTarget: null,
  playing: false,
  playSpeed: 60,
  inspectAt: null,

  setHoverLeg: (i) => set({ hoverLeg: i }),
  selectStation: (id) => set(id === null ? { selectedStationId: null } : { selectedStationId: id, editingPinId: null }),
  setPinDropType: (type) => set({ pinDropType: type }),
  editPin: (id) => set(id === null ? { editingPinId: null } : { editingPinId: id, selectedStationId: null }),
  flyTo: (p) => set({ flyTarget: { lat: p.lat, lon: p.lon, seq: (get().flyTarget?.seq ?? 0) + 1 } }),
  setPlaying: (on) => set({ playing: on }),
  setPlaySpeed: (speed) => set({ playSpeed: speed }),
  setInspectAt: (p) => set({ inspectAt: p }),
}))
