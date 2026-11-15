import { useEffect, useRef } from 'react'
import { useInteraction } from '../map/interaction'
import PinGlyph from '../map/PinGlyph'
import { pinTypeLabel } from '../map/pinLabels'
import { usePins } from '../state/pins'
import { fmtLatLon } from './format'

/** Small card over the map for one pin's note. Opens after a drop and when a pin is clicked. */
export default function PinEditor() {
  const id = useInteraction((s) => s.editingPinId)
  const editPin = useInteraction((s) => s.editPin)
  const pin = usePins((s) => s.pins.find((p) => p.id === id))
  const setPinNote = usePins((s) => s.setPinNote)
  const removePin = usePins((s) => s.removePin)
  const noteRef = useRef<HTMLTextAreaElement | null>(null)

  useEffect(() => {
    if (!id) return
    noteRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') editPin(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [id, editPin])

  if (!pin) return null

  return (
    <div
      data-map-obstacle
      role="dialog"
      aria-label={`${pinTypeLabel(pin.type)} pin note`}
      className="absolute left-[calc(var(--mm-inset-left,0px)+0.75rem)] top-[calc(var(--mm-inset-top,0px)+0.75rem)] z-10 w-72 space-y-2 rounded-md border border-line bg-panel/95 p-3 text-sm text-fg shadow-lg"
    >
      <div className="flex items-center gap-2">
        <PinGlyph type={pin.type} />
        <h2 className="text-base font-semibold">{pinTypeLabel(pin.type)}</h2>
        <button
          type="button"
          onClick={() => editPin(null)}
          aria-label="Close pin note"
          className="ml-auto rounded border border-line px-2 text-xs text-fg-muted hover:text-fg"
        >
          ✕
        </button>
      </div>
      <textarea
        ref={noteRef}
        value={pin.note}
        rows={3}
        placeholder="What did you see here?"
        aria-label="Note"
        onChange={(e) => setPinNote(pin.id, e.target.value)}
        className="w-full resize-none rounded border border-line bg-bg px-2 py-1 text-sm text-fg placeholder:text-fg-muted"
      />
      <div className="font-mono text-[10px] text-fg-muted">{fmtLatLon(pin.lat, pin.lon)} · dropped by crew</div>
      <div className="flex justify-between">
        <button
          type="button"
          onClick={() => {
            editPin(null)
            removePin(pin.id)
          }}
          className="rounded border border-line px-2 py-1 text-xs text-fg-muted hover:text-fg"
        >
          Delete pin
        </button>
        <button
          type="button"
          onClick={() => editPin(null)}
          className="rounded border border-fg-muted px-3 py-1 text-xs text-fg hover:border-fg"
        >
          Done
        </button>
      </div>
      <p className="text-[10px] text-fg-muted">Saved in this browser as you type.</p>
    </div>
  )
}
