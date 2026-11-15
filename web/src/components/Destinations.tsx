import { bearingDeg, distanceM } from '../lib/helpers'
import { useInteraction } from '../map/interaction'
import { useData } from '../state/data'
import { fmtBearing, fmtDistance } from './format'
import { defaultStops, useWalkStops } from './walkStops'

/**
 * Every destination on the map, with a tick for "in the walk". The walk is replanned on every change,
 * so the crew sees the time limit bite (GO -> CAUTION -> NO-GO) as stops are added.
 */
export default function Destinations() {
  const loaded = useData((s) => s.loaded)
  const stations = useData((s) => s.stations)
  const included = useWalkStops((s) => s.included)
  const toggle = useWalkStops((s) => s.toggle)
  const reset = useWalkStops((s) => s.reset)
  const select = useInteraction((s) => s.selectStation)
  const flyTo = useInteraction((s) => s.flyTo)

  if (!loaded || stations.length < 2) return null
  const base = stations[0]
  const inWalk = new Set(['B', ...(included ?? defaultStops(stations))])
  const stops = stations.slice(1)

  return (
    <section aria-label="Destinations" className="space-y-2.5">
      <div>
        <span className="text-xs text-fg-muted">
          {inWalk.size - 1} of {stops.length} in the walk
        </span>
      </div>
      <ul className="divide-y divide-line rounded-[3px] border border-line">
        {stops.map((s) => {
          const on = inWalk.has(s.id)
          return (
            <li key={s.id} className="flex items-center gap-2.5 px-2.5 py-1">
              <input
                type="checkbox"
                className="h-4 w-4 shrink-0 accent-brand"
                checked={on}
                disabled={on && inWalk.size === 2}
                title={on && inWalk.size === 2 ? 'The walk needs at least one stop' : undefined}
                aria-label={`${s.name}: ${on ? 'in the walk' : 'not in the walk'}`}
                onChange={() => toggle(stations, s.id)}
              />
              <span
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full font-mono text-[10px] font-bold ${
                  on ? 'bg-fg text-bg' : 'border border-dashed border-fg/80 text-fg'
                }`}
              >
                {s.id.replace(/^S/, '')}
              </span>
              <button
                type="button"
                onClick={() => {
                  select(s.id)
                  flyTo(s)
                }}
                className="min-w-0 flex-1 text-left"
              >
                <span className="block truncate text-sm text-fg hover:text-brand">{s.name}</span>
                <span className="block truncate text-[11px] text-fg-muted">
                  {s.sol !== null ? `Rover stop, sol ${s.sol}` : 'Mapped feature, USGS SIM 3464'}
                </span>
              </button>
              <span className="shrink-0 text-right font-mono text-[11px] text-fg-muted">
                {fmtDistance(distanceM(base, s))}
                <br />
                {fmtBearing(bearingDeg(base, s))}
              </span>
            </li>
          )
        })}
      </ul>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] leading-tight text-fg-muted">
          Distance and bearing from base: straight line, Mars sphere. Tick a stop to add it; the walk replans.
        </p>
        {included !== null && (
          <button
            type="button"
            onClick={reset}
            className="shrink-0 rounded-[3px] border border-line bg-panel-2 px-2 py-1 text-xs text-fg hover:border-fg-muted"
          >
            Back to EVA-1
          </button>
        )}
      </div>
    </section>
  )
}
