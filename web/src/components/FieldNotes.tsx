import { useInteraction } from '../map/interaction'
import PinGlyph from '../map/PinGlyph'
import { PIN_TYPES, pinTypeLabel } from '../map/pinLabels'
import { usePins } from '../state/pins'
import { fmtLatLon } from './format'

/** Left-panel section: pick a pin type to drop on the map, then edit, find or delete pins. */
export default function FieldNotes() {
  const pins = usePins((s) => s.pins)
  const setPinNote = usePins((s) => s.setPinNote)
  const removePin = usePins((s) => s.removePin)
  const dropType = useInteraction((s) => s.pinDropType)
  const setDropType = useInteraction((s) => s.setPinDropType)
  const editPin = useInteraction((s) => s.editPin)
  const editingId = useInteraction((s) => s.editingPinId)
  const flyTo = useInteraction((s) => s.flyTo)

  return (
    <section aria-label="Field notes" className="space-y-3">
      <h2 className="text-[11px] font-semibold uppercase tracking-wider text-fg-muted">Field notes</h2>

      <div className="grid grid-cols-3 gap-2" role="group" aria-label="Drop a pin">
        {PIN_TYPES.map(({ type, label }) => {
          const active = dropType === type
          return (
            <button
              key={type}
              type="button"
              aria-pressed={active}
              onClick={() => setDropType(active ? null : type)}
              className={`flex flex-col items-center gap-1 rounded border px-1 py-2 text-xs ${
                active ? 'border-fg bg-panel-2 text-fg' : 'border-line text-fg-muted hover:text-fg'
              }`}
            >
              <PinGlyph type={type} />
              {label}
            </button>
          )
        })}
      </div>
      {dropType && (
        <p role="status" className="text-xs text-fg">
          Click the map to drop a {pinTypeLabel(dropType).toLowerCase()} pin. Esc cancels.
        </p>
      )}

      {pins.length === 0 ? (
        <p className="text-xs text-fg-muted">No pins yet. They are saved in this browser.</p>
      ) : (
        <ul className="space-y-2">
          {pins.map((p) => (
            <li
              key={p.id}
              className={`space-y-1.5 rounded border p-2 ${editingId === p.id ? 'border-fg-muted' : 'border-line'}`}
            >
              <div className="flex items-center gap-2">
                <PinGlyph type={p.type} size={16} />
                <span className="text-xs font-semibold text-fg">{pinTypeLabel(p.type)}</span>
                <span className="ml-auto flex gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      flyTo(p)
                      editPin(p.id)
                    }}
                    className="rounded border border-line px-1.5 text-[11px] text-fg-muted hover:text-fg"
                  >
                    Fly to
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (editingId === p.id) editPin(null)
                      removePin(p.id)
                    }}
                    aria-label={`Delete ${pinTypeLabel(p.type)} pin`}
                    className="rounded border border-line px-1.5 text-[11px] text-fg-muted hover:text-fg"
                  >
                    Delete
                  </button>
                </span>
              </div>
              <input
                type="text"
                value={p.note}
                placeholder="Add a note"
                aria-label={`Note for ${pinTypeLabel(p.type)} pin`}
                onChange={(e) => setPinNote(p.id, e.target.value)}
                className="w-full rounded border border-line bg-bg px-2 py-1 text-xs text-fg placeholder:text-fg-muted"
              />
              <div className="font-mono text-[10px] text-fg-muted">{fmtLatLon(p.lat, p.lon)} · dropped by crew</div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
