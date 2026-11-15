import { create } from 'zustand'
import type { PinType } from '../state/pins'
import type { CameraPreset } from './cameraPresets'

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
  /** Camera view the 3D map should fly to; `seq` changes on every request. */
  cameraPreset: { name: CameraPreset; seq: number } | null
  /**
   * Ground view ("Stand here"): the point the viewer stands on, and the station there (null for any other
   * point). `seq` changes on every request, so standing somewhere else moves the viewer. Null: normal map.
   */
  ground: { at: { lat: number; lon: number }; stationId: string | null; seq: number } | null
  /** Whether the ground view can open: the map has 3D height tiles and the height grid has loaded. Set by the map. */
  groundAvailable: boolean

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
  setCameraPreset: (name: CameraPreset) => void
  /** Stand at a point (and close the station card and point card, which the ground view replaces). */
  standHere: (at: { lat: number; lon: number }, stationId: string | null) => void
  leaveGround: () => void
  setGroundAvailable: (on: boolean) => void
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
  cameraPreset: null,
  ground: null,
  groundAvailable: false,

  setHoverLeg: (i) => set({ hoverLeg: i }),
  selectStation: (id) => set(id === null ? { selectedStationId: null } : { selectedStationId: id, editingPinId: null }),
  setPinDropType: (type) => set({ pinDropType: type }),
  editPin: (id) => set(id === null ? { editingPinId: null } : { editingPinId: id, selectedStationId: null }),
  flyTo: (p) => set({ flyTarget: { lat: p.lat, lon: p.lon, seq: (get().flyTarget?.seq ?? 0) + 1 } }),
  setPlaying: (on) => set({ playing: on }),
  setPlaySpeed: (speed) => set({ playSpeed: speed }),
  setInspectAt: (p) => set({ inspectAt: p }),
  setCameraPreset: (name) => set({ cameraPreset: { name, seq: (get().cameraPreset?.seq ?? 0) + 1 } }),
  standHere: (at, stationId) =>
    set({
      ground: { at: { lat: at.lat, lon: at.lon }, stationId, seq: (get().ground?.seq ?? 0) + 1 },
      selectedStationId: null,
      inspectAt: null,
    }),
  leaveGround: () => set({ ground: null }),
  setGroundAvailable: (on) => set({ groundAvailable: on }),
}))
