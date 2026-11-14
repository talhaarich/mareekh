import { useState } from 'react'
import type { ReactNode } from 'react'
import { useInteraction } from '../map/interaction'
import { assumptionValue, useData, type Assumption } from '../state/data'
import { usePlan } from '../state/plan'
import {
  DASH,
  fmtDistance,
  fmtDose,
  fmtDuration,
  fmtEnergy,
  fmtSignedDuration,
} from './format'
import { usePlanParams } from './planParams'
import { STATUS_STYLE } from './status'


function Tile({ label, value, source }: { label: string; value: string; source: string }) {
  return (
    <div className="rounded-md border border-line bg-panel-2 p-2">
      <div className="text-[11px] uppercase tracking-wider text-fg-muted">{label}</div>
      <div className="font-mono text-base text-fg">{value}</div>
      <div className="mt-0.5 text-[10px] leading-tight text-fg-muted">{source}</div>
    </div>
  )
}

interface ReleaseSliderProps {
  label: string
  min: number
  max: number
  step: number
  value: number
  show: (v: number) => string
  note: ReactNode
  onCommit: (v: number) => void
}

/** Moves freely while dragged, but only tells the planner when it is released. */
function ReleaseSlider({ label, min, max, step, value, show, note, onCommit }: ReleaseSliderProps) {
  const [draft, setDraft] = useState<number | null>(null)
  const commit = () => {
    if (draft !== null) {
      onCommit(draft)
      setDraft(null)
    }
  }
  return (
    <label className="block text-xs text-fg-muted">
      <span className="flex justify-between">
        <span>{label}</span>
        <span className="font-mono text-fg">{show(draft ?? value)}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={draft ?? value}
        onChange={(e) => setDraft(Number(e.target.value))}
        onPointerUp={commit}
        onKeyUp={commit}
        onBlur={commit}
        className="mt-1 w-full accent-brand"
      />
      <span className="block text-[10px] leading-tight">{note}</span>
    </label>
  )
}

function assumptionNote(assumptions: Assumption[], key: string): string {
  const a = assumptions.find((x) => x.key === key)
  if (!a) return DASH
  return `${a.kind === 'team' ? 'Team assumption' : 'Published'}: ${a.source}`
}

export default function PlanPanel() {
  const loaded = useData((s) => s.loaded)
  const gridError = useData((s) => s.gridError)
  const assumptions = useData((s) => s.assumptions)
  const result = usePlan((s) => s.result)
  const busy = usePlan((s) => s.busy)
  const params = usePlanParams((s) => s.params)
  const commit = usePlanParams((s) => s.commit)
  const hoverLeg = useInteraction((s) => s.hoverLeg)
  const setHoverLeg = useInteraction((s) => s.setHoverLeg)

  if (!loaded || !params) {
    return <p className="text-sm text-fg-muted">Loading the plan…</p>
  }

  const status = result ? STATUS_STYLE[result.status] : null
  const hardLimit = assumptionValue(assumptions, 'slope_limit_hard_deg')

  return (
    <div className="space-y-5">
      <section aria-label="Walk status" className="space-y-2">
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-fg-muted">
          Plan {busy && <span className="normal-case tracking-normal">· planning…</span>}
        </h2>
        {status && result ? (
          <>
            <div className={`inline-block rounded border px-3 py-1 text-sm font-bold tracking-wider ${status.cls}`}>
              {status.label}
            </div>
            <p className="text-sm text-fg">{result.reason}</p>
            <p className="text-[10px] leading-tight text-fg-muted">
              Route model. Time limit from the slider below; caution margin caution_spare_s from assumptions.json.
            </p>
          </>
        ) : gridError ? (
          <p role="status" className="text-sm text-fg-muted">
            Planning is off: the height grid could not load ({gridError}). The data pipeline builds it.
          </p>
        ) : (
          <p className="text-sm text-fg-muted">{busy ? 'Planning the walk…' : 'No plan yet.'}</p>
        )}
      </section>

      {result && (
        <>
          <section aria-label="Summary" className="grid grid-cols-2 gap-2">
            <Tile
              label="Total time"
              value={fmtDuration(result.totalTimeS)}
              source="Team speed model, Apollo-based speeds"
            />
            <Tile
              label="Spare time"
              value={fmtSignedDuration(result.spareS)}
              source="Time limit minus total time"
            />
            <Tile label="Distance" value={fmtDistance(result.distanceM)} source="Route over the height grid" />
            <Tile label="Energy" value={fmtEnergy(result.energyKJ)} source="NASA Apollo work rates, team model" />
            <div className="col-span-2">
              <Tile
                label="Radiation dose"
                value={fmtDose(result.doseMSv)}
                source="Curiosity RAD, measured in Gale crater, applied to Jezero"
              />
            </div>
          </section>

          <p className="text-xs text-fg-muted">
            {result.turnBack
              ? `Turn back by ${fmtDuration(result.turnBack.elapsedS)} into the walk, ${fmtDistance(result.turnBack.distanceAlongM)} along the route (route model).`
              : 'No turn-back point needed: every point on the route still fits the time limit (route model).'}
          </p>

          <section aria-label="Legs">
            <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-fg-muted">Legs</h3>
            <table className="w-full text-xs">
              <thead className="text-left text-fg-muted">
                <tr>
                  <th className="py-1 font-normal">Leg</th>
                  <th className="py-1 text-right font-normal">Time</th>
                  <th className="py-1 text-right font-normal">Distance</th>
                </tr>
              </thead>
              <tbody>
                {result.legs.map((leg, i) => (
                  <tr
                    key={`${leg.fromId}-${leg.toId}-${i}`}
                    tabIndex={0}
                    onMouseEnter={() => setHoverLeg(i)}
                    onMouseLeave={() => setHoverLeg(null)}
                    onFocus={() => setHoverLeg(i)}
                    onBlur={() => setHoverLeg(null)}
                    className={`cursor-default border-t border-line ${hoverLeg === i ? 'bg-panel-2' : ''}`}
                  >
                    <td className="py-1 font-mono text-fg">
                      {leg.fromId} → {leg.toId}
                    </td>
                    <td className="py-1 text-right font-mono">{leg.ok ? fmtDuration(leg.timeS) : 'no path'}</td>
                    <td className="py-1 text-right font-mono">{leg.ok ? fmtDistance(leg.distanceM) : DASH}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-1 text-[10px] leading-tight text-fg-muted">
              Times and distances: route model over the height grid, team speed model.
            </p>
          </section>
        </>
      )}

      <section aria-label="Plan settings" className="space-y-4">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-fg-muted">Settings</h3>
        <ReleaseSlider
          label="Slope limit"
          min={5}
          max={hardLimit}
          step={1}
          value={params.slopeLimitDeg}
          show={(v) => `${v}°`}
          note={assumptionNote(assumptions, 'slope_limit_plan_deg')}
          onCommit={(v) => commit({ slopeLimitDeg: v })}
        />
        <ReleaseSlider
          label="Carried equipment"
          min={0}
          max={40}
          step={1}
          value={params.carriedKg}
          show={(v) => `${v} kg`}
          note="Your choice, 0 to 40 kg"
          onCommit={(v) => commit({ carriedKg: v })}
        />
        <ReleaseSlider
          label="Time limit"
          min={3600}
          max={43200}
          step={900}
          value={params.timeLimitS}
          show={fmtDuration}
          note={assumptionNote(assumptions, 'eva_time_limit_s')}
          onCommit={(v) => commit({ timeLimitS: v })}
        />
      </section>
    </div>
  )
}
