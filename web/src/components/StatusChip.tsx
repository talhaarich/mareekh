import { walkHomeS } from '../lib/helpers'
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

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Walk status"
      className={`pointer-events-auto rounded-md border border-line bg-panel/95 px-2.5 py-1.5 text-xs text-fg shadow-lg backdrop-blur ${className}`}
    >
      {status && result ? (
        <div className="flex items-center gap-2.5">
          <span className={`shrink-0 rounded-[3px] border px-2 py-0.5 font-display text-sm font-bold tracking-wider ${status.cls}`}>
            {status.label}
          </span>
          <span className="hidden max-w-[22rem] truncate leading-tight lg:inline" title={result.reason}>
            {result.reason}
          </span>
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
      {result && (
        <div className="mt-0.5 text-[10px] leading-tight text-fg-muted">
          Route model. Walk home from the simulated position.
        </div>
      )}
    </div>
  )
}
