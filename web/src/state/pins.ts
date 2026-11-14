import { create } from 'zustand'

/**
 * `pins` slice (PLANNER_API.md shared state). Owner: Rafay. Only this file changes it.
 * Saved in the browser under the key `mm.pins.v1` as a plain JSON array of pins.
 */
export type PinType = 'hazard' | 'sample' | 'feature'

export interface Pin {
  id: string
  type: PinType
  lat: number
  lon: number
  note: string
}

export const PINS_STORAGE_KEY = 'mm.pins.v1'

const PIN_TYPES: readonly PinType[] = ['hazard', 'sample', 'feature']

function isPin(value: unknown): value is Pin {
  if (typeof value !== 'object' || value === null) return false
  const p = value as Record<string, unknown>
  return (
    typeof p.id === 'string' &&
    typeof p.type === 'string' &&
    (PIN_TYPES as readonly string[]).includes(p.type) &&
    typeof p.lat === 'number' &&
    typeof p.lon === 'number' &&
    typeof p.note === 'string'
  )
}

function loadPins(): Pin[] {
  try {
    const raw = localStorage.getItem(PINS_STORAGE_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter(isPin) : []
  } catch {
    return [] // storage blocked or corrupt: start empty, never crash the app
  }
}

function savePins(pins: Pin[]): void {
  try {
    localStorage.setItem(PINS_STORAGE_KEY, JSON.stringify(pins))
  } catch {
    // storage full or blocked: pins stay in memory for this session
  }
}

function newId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `pin-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

export interface PinsState {
  pins: Pin[]
  /** Returns the new pin's id. */
  addPin: (type: PinType, position: { lat: number; lon: number }, note?: string) => string
  setPinNote: (id: string, note: string) => void
  removePin: (id: string) => void
}

export const usePins = create<PinsState>()((set, get) => ({
  pins: loadPins(),

  addPin: (type, position, note = '') => {
    const pin: Pin = { id: newId(), type, lat: position.lat, lon: position.lon, note }
    const pins = [...get().pins, pin]
    savePins(pins)
    set({ pins })
    return pin.id
  },
  setPinNote: (id, note) => {
    const pins = get().pins.map((p) => (p.id === id ? { ...p, note } : p))
    savePins(pins)
    set({ pins })
  },
  removePin: (id) => {
    const pins = get().pins.filter((p) => p.id !== id)
    savePins(pins)
    set({ pins })
  },
}))
