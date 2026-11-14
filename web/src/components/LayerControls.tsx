import { useMemo } from 'react'
import { overlayLayers, resolveBaseView, viewLayers } from '../map/layers'
import { useLayerAvailability } from '../map/useLayerAvailability'
import { useData } from '../state/data'
import { reachBlockedByOverlay, useView } from '../state/view'
import type { Reach } from '../state/view'

const REACH_OPTIONS: { id: Reach; label: string }[] = [
  { id: 'off', label: 'Off' },
  { id: 'distance', label: 'Distance rings' },
  { id: 'time', label: 'Walk-time lines' },
]

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="space-y-2 border-0 p-0">
      <legend className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-fg-muted">{title}</legend>
      {children}
    </fieldset>
  )
}

interface RadioRowProps {
  name: string
  label: string
  checked: boolean
  disabled?: boolean
  note?: string
  title?: string
  onSelect: () => void
}

function RadioRow({ name, label, checked, disabled = false, note, title, onSelect }: RadioRowProps) {
  return (
    <label
      title={title}
      className={`flex items-center gap-2 text-sm ${disabled ? 'cursor-not-allowed text-fg-muted/60' : 'cursor-pointer text-fg'}`}
    >
      <input
        type="radio"
        name={name}
        className="accent-brand"
        checked={checked}
        disabled={disabled}
        onChange={onSelect}
      />
      <span>{label}</span>
      {note && <span className="text-xs text-fg-muted">{note}</span>}
    </label>
  )
}

export default function LayerControls() {
  const manifest = useData((s) => s.manifest)
  const available = useLayerAvailability((s) => s.available)

  const baseView = useView((s) => s.baseView)
  const reach = useView((s) => s.reach)
  const overlay = useView((s) => s.overlay)
  const overlayStrength = useView((s) => s.overlayStrength)
  const showWind = useView((s) => s.showWind)
  const showLabels = useView((s) => s.showLabels)
  const setBaseView = useView((s) => s.setBaseView)
  const setReach = useView((s) => s.setReach)
  const setOverlay = useView((s) => s.setOverlay)
  const setOverlayStrength = useView((s) => s.setOverlayStrength)
  const setShowWind = useView((s) => s.setShowWind)
  const setShowLabels = useView((s) => s.setShowLabels)

  const views = useMemo(() => viewLayers(manifest), [manifest])
  const overlays = useMemo(() => overlayLayers(manifest), [manifest])
  const activeView = resolveBaseView(views, baseView)

  if (!manifest) {
    return <p className="text-sm text-fg-muted">Loading layers…</p>
  }

  const missing = (id: string) => (available[id] === false ? 'not built yet' : undefined)
  const fillHint = 'Two colour fills cannot be on at once. Turn the other one off first.'

  return (
    <div className="space-y-6">
      <Group title="Map view">
        {views.map((v) => (
          <RadioRow
            key={v.id}
            name="mm-view"
            label={v.name}
            checked={activeView?.id === v.id}
            note={missing(v.id)}
            onSelect={() => setBaseView(v.id)}
          />
        ))}
      </Group>

      <Group title="Reach from base">
        {REACH_OPTIONS.map((o) => {
          const blocked = reachBlockedByOverlay(o.id, overlay)
          return (
            <RadioRow
              key={o.id}
              name="mm-reach"
              label={o.label}
              checked={reach === o.id}
              disabled={blocked}
              title={blocked ? fillHint : undefined}
              onSelect={() => setReach(o.id)}
            />
          )
        })}
        {reach !== 'off' && (
          <p className="text-xs text-fg-muted">Drawing on the map is not wired yet.</p>
        )}
      </Group>

      <Group title="Data overlay">
        <RadioRow name="mm-overlay" label="None" checked={overlay === null} onSelect={() => setOverlay(null)} />
        {overlays.map((o) => {
          const blocked = reachBlockedByOverlay(reach, o.id)
          return (
            <RadioRow
              key={o.id}
              name="mm-overlay"
              label={o.name}
              checked={overlay === o.id}
              disabled={blocked}
              note={missing(o.id)}
              title={blocked ? fillHint : undefined}
              onSelect={() => setOverlay(o.id)}
            />
          )
        })}
        <label className={`block text-xs ${overlay === null ? 'text-fg-muted/60' : 'text-fg-muted'}`}>
          Strength: {Math.round(overlayStrength * 100)} % (display setting)
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={overlayStrength}
            disabled={overlay === null}
            onChange={(e) => setOverlayStrength(Number(e.target.value))}
            className="mt-1 w-full accent-brand"
          />
        </label>
      </Group>

      <Group title="Show">
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="accent-brand"
            checked={showWind}
            onChange={(e) => setShowWind(e.target.checked)}
          />
          Wind arrows
        </label>
        {showWind && <p className="text-xs text-fg-muted">No wind data file in the data contracts yet.</p>}
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="accent-brand"
            checked={showLabels}
            onChange={(e) => setShowLabels(e.target.checked)}
          />
          Labels
        </label>
      </Group>
    </div>
  )
}
