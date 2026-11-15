import { useMemo } from 'react'
import type { ReactNode } from 'react'
import { useInteraction } from '../map/interaction'
import { overlayLayers, resolveBaseView, viewLayers } from '../map/layers'
import { useLayerAvailability } from '../map/useLayerAvailability'
import { SLOPE_OVERLAY_ID } from '../map/SlopeGridLayer'
import { useTerrainSource } from '../map/terrain'
import { exaggerationLabel, trueScaleFactor } from '../map/groundScale'
import { assumptionValue, useData } from '../state/data'
import { EXAGGERATION_MAX, EXAGGERATION_MIN, reachBlockedByOverlay, useView } from '../state/view'
import type { Reach } from '../state/view'
import { ChoiceButton, PanelTitle, Segmented } from './controls'

const REACH_OPTIONS: { id: Reach; label: string }[] = [
  { id: 'off', label: 'Off' },
  { id: 'distance', label: 'Distance' },
  { id: 'time', label: 'Time' },
]

const FILL_HINT = 'Two colour fills cannot be on at once. Turn the other one off first.'

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2.5">
      <PanelTitle>{title}</PanelTitle>
      {children}
    </section>
  )
}

function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (on: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center gap-2.5 text-sm text-fg">
      <input type="checkbox" className="h-4 w-4 accent-brand" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  )
}

function Slider({ label, value, min, max, step, disabled, onChange, note }: {
  label: string
  value: number
  min: number
  max: number
  step: number
  disabled?: boolean
  onChange: (v: number) => void
  note?: string
}) {
  return (
    <label className={`block text-xs ${disabled ? 'text-fg-muted/60' : 'text-fg-muted'}`}>
      {label}
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-1.5 w-full accent-brand"
      />
      {note && <span className="block text-[10px] leading-tight">{note}</span>}
    </label>
  )
}

/** One floating panel's part of the map controls; all of them when omitted. "view" includes Show on map. */
export type LayerPart = 'view' | 'reach' | 'overlay'

export default function LayerControls({ part }: { part?: LayerPart } = {}) {
  const show = (p: LayerPart) => part === undefined || part === p
  const manifest = useData((s) => s.manifest)
  const dem = useTerrainSource(manifest)
  const hasGrid = useData((s) => s.grid !== null)
  const available = useLayerAvailability((s) => s.available)

  const v = useView()
  const flyTo3d = useInteraction((s) => s.setCameraPreset)
  // The ground view sets 3D and the exaggeration itself, and puts them back when it ends.
  const groundOn = useInteraction((s) => s.ground !== null)
  const assumptions = useData((s) => s.assumptions)
  const trueScale = assumptions.some((a) => a.key === 'mars_radius_m')
    ? trueScaleFactor(assumptionValue(assumptions, 'mars_radius_m'))
    : null

  const views = useMemo(() => viewLayers(manifest), [manifest])
  const overlays = useMemo(() => overlayLayers(manifest), [manifest])
  const activeView = resolveBaseView(views, v.baseView)

  if (!manifest) {
    return <p className="text-sm text-fg-muted">Loading layers…</p>
  }

  const missing = (id: string) => available[id] === false
  const overlayOptions = [
    ...overlays.map((o) => ({ id: o.id, label: o.name, missing: missing(o.id) })),
    { id: SLOPE_OVERLAY_ID, label: 'Slope grid (route planner)', missing: !hasGrid },
  ]

  return (
    <div className="space-y-7">
      {show('view') && (
        <Group title="Map view">
          <div className="grid grid-cols-2 gap-2">
            {views.map((l) => (
              <ChoiceButton
                key={l.id}
                on={activeView?.id === l.id}
                onClick={() => v.setBaseView(l.id)}
                title={missing(l.id) ? 'Not built yet' : undefined}
              >
                {l.name}
                {missing(l.id) && <span className="ml-1 text-[10px] opacity-70">(not built)</span>}
              </ChoiceButton>
            ))}
          </div>
          <Segmented
            label="2D or 3D"
            value={v.terrain3d ? '3d' : '2d'}
            onChange={(d) => v.setTerrain3d(d === '3d')}
            options={[
              { id: '2d', label: '2D', disabled: groundOn, title: groundOn ? 'Leave the ground view first' : undefined },
              { id: '3d', label: '3D', disabled: !dem || groundOn, title: !dem ? 'No height tiles built yet' : groundOn ? 'Leave the ground view first' : undefined },
            ]}
          />
          {v.terrain3d && dem && (
            <>
              <Slider
                label={`Vertical exaggeration: ${
                  trueScale ? exaggerationLabel(v.exaggeration, trueScale) : `${v.exaggeration.toFixed(1)}×`
                } (display setting)`}
                value={v.exaggeration}
                min={EXAGGERATION_MIN}
                max={EXAGGERATION_MAX}
                step={0.5}
                disabled={groundOn}
                onChange={v.setExaggeration}
                note={
                  groundOn
                    ? 'The ground view uses true scale; it puts your setting back when you leave.'
                    : 'Relative to true scale (heights in proportion to distances). Visual only. Right-drag (or two fingers) to tilt and turn.'
                }
              />
              <div className="grid grid-cols-2 gap-2">
                <ChoiceButton on={false} disabled={groundOn} onClick={() => flyTo3d('delta')} className="text-xs">
                  Fly to delta
                </ChoiceButton>
                <ChoiceButton on={false} disabled={groundOn} onClick={() => flyTo3d('crater')} className="text-xs">
                  Whole crater
                </ChoiceButton>
              </div>
            </>
          )}
        </Group>
      )}

      {show('reach') && (
        <Group title="Reach from base">
          <Segmented
            label="Reach from base"
            value={v.reach}
            onChange={(r) => v.setReach(r)}
            options={REACH_OPTIONS.map((o) => {
              const blocked = reachBlockedByOverlay(o.id, v.overlay)
              return { ...o, disabled: blocked, title: blocked ? FILL_HINT : undefined }
            })}
          />
        </Group>
      )}

      {show('overlay') && (
        <Group title="Data overlay">
          <select
            aria-label="Data overlay"
            value={v.overlay ?? ''}
            onChange={(e) => v.setOverlay(e.target.value === '' ? null : e.target.value)}
            className="w-full rounded-[3px] border border-line bg-panel-2 px-2.5 py-1.5 text-sm text-fg"
          >
            <option value="">None</option>
            {overlayOptions.map((o) => (
              <option key={o.id} value={o.id} disabled={o.missing || reachBlockedByOverlay(v.reach, o.id)}>
                {o.label}
                {o.missing ? ' (not built)' : reachBlockedByOverlay(v.reach, o.id) ? ' (turn reach off)' : ''}
              </option>
            ))}
          </select>
          <Slider
            label={`Overlay strength: ${Math.round(v.overlayStrength * 100)} % (display setting)`}
            value={v.overlayStrength}
            min={0}
            max={1}
            step={0.05}
            disabled={v.overlay === null}
            onChange={v.setOverlayStrength}
          />
        </Group>
      )}

      {show('view') && (
        <Group title="Show on map">
          <Check label="Labels" checked={v.showLabels} onChange={v.setShowLabels} />
        </Group>
      )}
    </div>
  )
}
