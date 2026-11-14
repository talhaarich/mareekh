import type { Pin, PinType } from '../state/pins'

/** Display names, in the order the type buttons show them. */
export const PIN_TYPES: { type: PinType; label: string }[] = [
  { type: 'hazard', label: 'Hazard' },
  { type: 'sample', label: 'Sample' },
  { type: 'feature', label: 'Feature' },
]

export function pinTypeLabel(type: PinType): string {
  return PIN_TYPES.find((t) => t.type === type)?.label ?? type
}

/** Longest note text shown in a map label, in characters. Longer notes end in an ellipsis. */
const MAX_NOTE_CHARS = 24

/** Map label text for a pin: its type, then the first line of its note, shortened. */
export function pinLabelText(pin: Pick<Pin, 'type' | 'note'>): string {
  const type = pinTypeLabel(pin.type)
  const note = pin.note.trim().split('\n')[0].trim()
  if (note === '') return type
  const short = note.length > MAX_NOTE_CHARS ? `${note.slice(0, MAX_NOTE_CHARS - 1).trimEnd()}…` : note
  return `${type}: ${short}`
}
