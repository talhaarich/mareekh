import { useState } from 'react'
import { walkHomeS } from '../lib/helpers'
import { useInteraction } from '../map/interaction'
import { useData } from '../state/data'
import { usePlan } from '../state/plan'
import { usePosition } from '../state/position'
import { DASH, fmtDuration, fmtSignedDuration } from './format'
import { STATUS_STYLE } from './status'

/**
 * GO / CAUTION / NO-GO with its reason, spare time and the walk home from the simulated position.
 * Always on screen over the map: hiding the panels never hides it.
 */
export default function StatusChip({ className = '' }: { className?: string }) {
  const result = usePlan((s) => s.result)
  const busy = usePlan((s) => s.busy)
  usePlan((s) => s.walkHomeVersion) // re-read the walk-home field when a new one arrives
  const gridError = useData((s) => s.gridError)
  const hasGrid = useData((s) => s.grid !== null)
  const estimate = usePosition((s) => s.estimate)
  const known = hasGrid && Number.isFinite(estimate.lat) && Number.isFinite(estimate.lon)
  const home = known ? walkHomeS(estimate) : NaN
  const homeText = Number.isNaN(home) ? DASH : Number.isFinite(home) ? fmtDuration(home) : 'no path'
  const status = result ? STATUS_STYLE[result.status] : null
  const [why, setWhy] = useState(false)
  // The welcome card's "See the plan" pulses this card.
  const pulsing = useInteraction((s) => s.pulse?.targets.includes('status') ?? false)

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Walk status"
      className={`pointer-events-auto rounded-md border border-line bg-panel/95 px-2.5 py-1.5 text-xs text-fg shadow-lg backdrop-blur ${pulsing ? 'animate-pulse ring-2 ring-route' : ''} ${className}`}
    >
      {status && result ? (
        <div className="flex items-center gap-2.5">
          <span className={`shrink-0 rounded-[3px] border px-2 py-0.5 font-display text-sm font-bold tracking-wider ${status.cls}`}>
            {status.label}
          </span>
          <button
            type="button"
            onClick={() => setWhy((w) => !w)}
            aria-expanded={why}
            aria-controls="status-why"
            className="shrink-0 text-xs font-medium text-route underline underline-offset-2 hover:text-fg"
          >
            {why ? 'Hide why' : 'Why?'}
          </button>
          <span className="flex shrink-0 flex-col leading-tight sm:flex-row sm:gap-3">
            <span>
              <span className="text-fg-muted">Spare </span>
              <span className="font-mono">{fmtSignedDuration(result.spareS)}</span>
            </span>
            <span>
              <span className="text-fg-muted">Walk home </span>
              <span className="font-mono">{homeText}</span>
            </span>
          </span>
        </div>
      ) : (
        <span className="text-fg-muted">
          {gridError ? 'Planning is off: the height grid could not load.' : busy ? 'Planning the walk…' : 'No plan yet.'}
        </span>
      )}
      {result && why && (
        <p id="status-why" className="mt-1 max-w-[26rem] text-xs leading-snug text-fg">
          {result.reason}
        </p>
      )}
      {result && (
        <div className="mt-0.5 text-[10px] leading-tight text-fg-muted">
          Route model. Walk home from the simulated position.
        </div>
      )}
    </div>
  )
}
