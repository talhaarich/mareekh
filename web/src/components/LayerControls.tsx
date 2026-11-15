import { useMemo } from 'react'
import { overlayLayers, resolveBaseView, viewLayers } from '../map/layers'
import { useLayerAvailability } from '../map/useLayerAvailability'
import { SLOPE_OVERLAY_ID } from '../map/SlopeGridLayer'
import { useTerrainSource } from '../map/terrain'
import { useData } from '../state/data'
import { EXAGGERATION_MAX, EXAGGERATION_MIN, reachBlockedByOverlay, useView } from '../state/view'
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
  const dem = useTerrainSource(manifest)
  const terrain3d = useView((s) => s.terrain3d)
  const exaggeration = useView((s) => s.exaggeration)
  const setTerrain3d = useView((s) => s.setTerrain3d)
  const setExaggeration = useView((s) => s.setExaggeration)
  const hasGrid = useData((s) => s.grid !== null)
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
        <div role="group" aria-label="2D or 3D" className="flex overflow-hidden rounded border border-line">
          {(['2D', '3D'] as const).map((d) => {
            const on = (d === '3D') === terrain3d
            return (
              <button
                key={d}
                type="button"
                aria-pressed={on}
                disabled={d === '3D' && !dem}
                title={d === '3D' && !dem ? 'No height tiles built yet' : undefined}
                onClick={() => setTerrain3d(d === '3D')}
                className={`flex-1 py-1 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-40 ${
                  on ? 'bg-route/15 text-route' : 'text-fg-muted hover:text-fg'
                }`}
              >
                {d}
              </button>
            )
          })}
        </div>
        {terrain3d && dem && (
          <label className="block text-xs text-fg-muted">
            Vertical exaggeration: {exaggeration.toFixed(1)}× (display setting)
            <input
              type="range"
              min={EXAGGERATION_MIN}
              max={EXAGGERATION_MAX}
              step={0.1}
              value={exaggeration}
              onChange={(e) => setExaggeration(Number(e.target.value))}
              className="mt-1 w-full accent-route"
            />
            <span className="block text-[10px] leading-tight">
              Visual only. Drag with the right mouse button (or two fingers) to tilt and turn.
            </span>
          </label>
        )}
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
        <RadioRow
          name="mm-overlay"
          label="Slope grid (route planner)"
          checked={overlay === SLOPE_OVERLAY_ID}
          disabled={reachBlockedByOverlay(reach, SLOPE_OVERLAY_ID) || !hasGrid}
          note={hasGrid ? undefined : 'height grid not loaded'}
          title={reachBlockedByOverlay(reach, SLOPE_OVERLAY_ID) ? fillHint : undefined}
          onSelect={() => setOverlay(SLOPE_OVERLAY_ID)}
        />
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
