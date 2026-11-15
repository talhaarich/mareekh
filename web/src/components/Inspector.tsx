import { useEffect } from 'react'
import { bearingDeg, distanceM, sample, walkHomeS } from '../lib/helpers'
import { useInteraction } from '../map/interaction'
import { useData } from '../state/data'
import { usePlan } from '../state/plan'
import { DASH, fmtBearing, fmtDistance, fmtDuration, fmtLatLon } from './format'
import { usePlanParams } from './planParams'

function Row({ label, value, source }: { label: string; value: string; source: string }) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-fg-muted">{label}</span>
        <span className="font-mono text-fg">{value}</span>
      </div>
      <div className="text-[10px] leading-tight text-fg-muted">{source}</div>
    </div>
  )
}

/** What the map knows about one clicked point: height, slope, whether the planner may walk it, the way home. */
export default function Inspector() {
  const at = useInteraction((s) => s.inspectAt)
  const close = useInteraction((s) => s.setInspectAt)
  const grid = useData((s) => s.grid)
  const stations = useData((s) => s.stations)
  const assumptions = useData((s) => s.assumptions)
  const params = usePlanParams((s) => s.params)
  usePlan((s) => s.walkHomeVersion) // re-read the walk-home field when a new one arrives
  const standHere = useInteraction((s) => s.standHere)
  const groundAvailable = useInteraction((s) => s.groundAvailable)

  useEffect(() => {
    if (!at) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [at, close])

  if (!at) return null
  const cell = grid ? sample(at) : null
  const base = stations[0]
  const hard = assumptions.find((a) => a.key === 'slope_limit_hard_deg')?.value
  const home = grid ? walkHomeS(at) : NaN

  let walkable: { text: string; cls: string } | null = null
  if (cell && params && hard !== undefined) {
    walkable =
      cell.slopeDeg <= params.slopeLimitDeg
        ? { text: `Walkable at the ${params.slopeLimitDeg}° plan limit`, cls: 'text-go' }
        : cell.slopeDeg <= hard
          ? { text: `Over the ${params.slopeLimitDeg}° plan limit`, cls: 'text-caution' }
          : { text: `Over the ${hard}° hard limit`, cls: 'text-nogo' }
  }

  return (
    <div
      data-map-obstacle
      role="dialog"
      aria-label="Map point"
      className="w-64 space-y-1.5 rounded-md border border-line bg-panel/95 p-3 text-xs text-fg shadow-lg"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Map point</h2>
        <button
          type="button"
          onClick={() => close(null)}
          aria-label="Close map point"
          className="rounded border border-line px-1.5 text-fg-muted hover:text-fg"
        >
          ✕
        </button>
      </div>
      <Row label="Position" value={fmtLatLon(at.lat, at.lon)} source="Where you clicked" />
      {!grid ? (
        <p className="text-fg-muted">The height grid has not loaded.</p>
      ) : !cell ? (
        <p className="text-fg-muted">Outside the height grid: no height or slope here.</p>
      ) : (
        <>
          <Row label="Height" value={`${Math.round(cell.heightM)} m`} source="CTX height grid, relative to the Mars areoid" />
          <Row label="Slope" value={`${cell.slopeDeg.toFixed(1)}°`} source="Horn slope from the height grid, 20 m cell" />
          {walkable && <div className={`font-semibold ${walkable.cls}`}>{walkable.text}</div>}
          <Row
            label="Walk home"
            value={Number.isNaN(home) ? DASH : Number.isFinite(home) ? fmtDuration(home) : 'no path'}
            source="Route model, fastest way to base"
          />
          <button
            type="button"
            disabled={!groundAvailable}
            onClick={() => standHere(at, null)}
            title={groundAvailable ? 'Simulated ground view from orbital data' : 'Needs the 3D height tiles'}
            className="mt-1 w-full rounded-[3px] border border-route px-2 py-1 text-xs font-medium text-route hover:bg-route/10 disabled:opacity-40"
          >
            Stand here (simulated view)
          </button>
        </>
      )}
      {base && (
        <Row
          label="To base"
          value={`${fmtDistance(distanceM(at, base))} · ${fmtBearing(bearingDeg(at, base))}`}
          source="Straight line, Mars sphere"
        />
      )}
    </div>
  )
}
