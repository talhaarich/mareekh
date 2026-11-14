import { bearingDeg, distanceM } from '../lib/helpers'
import { useInteraction } from '../map/interaction'
import { useData } from '../state/data'
import { usePlan } from '../state/plan'
import { selectFixPrompt, selectNextStop, usePosition } from '../state/position'
import { Fact, SectionTitle } from './Fact'
import { DASH, fmtBearing, fmtDistance, fmtDuration, fmtUncertainty } from './format'

/** Play speeds: simulated seconds per real second. A display choice, so no source is needed. */
const SPEEDS = [1, 10, 60] as const

/**
 * Walk rehearsal: moves the simulated position along the planned route. The clock itself runs in
 * useWalkClock (App), so the walk keeps moving when EVA mode replaces this panel.
 */
export default function RehearsalPanel() {
  const loaded = useData((s) => s.loaded)
  const stations = useData((s) => s.stations)
  const result = usePlan((s) => s.result)
  const estimate = usePosition((s) => s.estimate)
  const elapsedS = usePosition((s) => s.elapsedS)
  const uncertaintyM = usePosition((s) => s.uncertaintyM)
  const fixes = usePosition((s) => s.fixes)
  const fixPrompt = usePosition(selectFixPrompt)
  const nextStop = usePosition(selectNextStop)
  const playing = useInteraction((s) => s.playing)
  const playSpeed = useInteraction((s) => s.playSpeed)
  const setPlaying = useInteraction((s) => s.setPlaying)
  const setPlaySpeed = useInteraction((s) => s.setPlaySpeed)

  const totalS = result?.totalTimeS ?? NaN
  const canRehearse = loaded && result !== null && Number.isFinite(totalS)
  const base = stations[0]

  const reset = () => {
    setPlaying(false)
    usePosition.getState().reset()
  }

  return (
    <section aria-label="Walk rehearsal" className="space-y-3">
      <SectionTitle>Walk rehearsal (simulated)</SectionTitle>

      {!canRehearse ? (
        <p className="text-sm text-fg-muted">
          {result && !Number.isFinite(totalS)
            ? 'Rehearsal needs a route that reaches every station. ' + result.reason
            : 'No plan to rehearse yet.'}
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                if (!playing && elapsedS >= totalS) usePosition.getState().reset() // play again from the start
                setPlaying(!playing)
              }}
              className="min-w-16 rounded border border-route px-3 py-1 text-sm font-semibold text-route"
            >
              {playing ? 'Pause' : 'Play'}
            </button>
            <div role="group" aria-label="Play speed" className="flex overflow-hidden rounded border border-line">
              {SPEEDS.map((s) => (
                <button
                  key={s}
                  type="button"
                  aria-pressed={playSpeed === s}
                  onClick={() => setPlaySpeed(s)}
                  className={`px-2 py-1 font-mono text-xs ${playSpeed === s ? 'bg-panel-2 text-fg' : 'text-fg-muted hover:text-fg'}`}
                >
                  {s}×
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={reset}
              className="ml-auto rounded border border-line px-2 py-1 text-xs text-fg-muted hover:text-fg"
            >
              Reset
            </button>
          </div>

          <label className="block text-xs text-fg-muted">
            <span className="flex justify-between">
              <span>Elapsed</span>
              <span className="font-mono text-fg">
                {fmtDuration(elapsedS)} of {fmtDuration(totalS)}
              </span>
            </span>
            <input
              type="range"
              min={0}
              max={totalS}
              step={1}
              value={Math.min(elapsedS, totalS)}
              onChange={(e) => usePosition.getState().simulateTo(Number(e.target.value))}
              className="mt-1 w-full accent-route"
              aria-label="Scrub through the walk"
            />
            <span className="block text-[10px] leading-tight">
              Simulated clock; walk length from the route model. Play speed is a display choice.
            </span>
          </label>

          {fixPrompt && (
            <div className="flex items-center justify-between gap-2 rounded border border-route p-2">
              <span className="text-sm text-fg">Confirm a fix at {fixPrompt}</span>
              <button
                type="button"
                onClick={() => usePosition.getState().fixAt(fixPrompt)}
                className="rounded border border-route px-2 py-1 text-xs font-semibold text-route"
              >
                Confirm fix
              </button>
            </div>
          )}

          <div className="space-y-2">
            <Fact
              label="To base"
              value={
                base ? `${fmtDistance(distanceM(estimate, base))} · ${fmtBearing(bearingDeg(estimate, base))}` : DASH
              }
              source="Straight line, Mars sphere, from the simulated position"
            />
            <Fact
              label="Uncertainty"
              value={fmtUncertainty(uncertaintyM)}
              source="Simulated: drift_fraction (team placeholder) × distance walked since the last fix"
            />
            <Fact
              label="Next stop"
              value={nextStop ?? (elapsedS > 0 ? 'Walk finished' : DASH)}
              source="Along the planned route"
            />
          </div>

          <div>
            <h3 className="mb-1 text-xs font-semibold text-fg">Fix log</h3>
            {fixes.length === 0 ? (
              <p className="text-xs text-fg-muted">No fixes yet.</p>
            ) : (
              <ul className="space-y-0.5 text-xs text-fg-muted">
                {fixes.map((f, i) => (
                  <li key={i}>
                    Fix at {f.stationId}, {fmtDuration(f.elapsedS)}, confirmed by crew
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </section>
  )
}
