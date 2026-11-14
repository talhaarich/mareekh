import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { bearingDeg, distanceM, nearestStationId, walkHomeS } from '../lib/helpers'
import { useData } from '../state/data'
import { usePins } from '../state/pins'
import { usePlan } from '../state/plan'
import { selectFixPrompt, selectNextStop, selectTimeLeftS, usePosition } from '../state/position'
import { useView } from '../state/view'
import { DASH, fmtBearing, fmtDistance, fmtDuration, fmtSignedDuration, fmtUncertainty } from './format'
import { usePlanParams } from './planParams'
import { STATUS_STYLE } from './status'

function Block({ label, children, source }: { label: string; children: ReactNode; source: string }) {
  return (
    <div className="space-y-1">
      <div className="text-xs font-semibold uppercase tracking-widest text-fg-muted">{label}</div>
      {children}
      <div className="text-xs text-fg-muted">{source}</div>
    </div>
  )
}

/** Walk-home time at the simulated position. Re-renders when a new walk-home field arrives. */
function useWayHomeS(p: { lat: number; lon: number }): number {
  usePlan((s) => s.walkHomeVersion)
  return walkHomeS(p)
}

/**
 * EVA mode: one screen for outside. Large type, high contrast, only what matters: next stop, time left,
 * way home, uncertainty, status, and two big buttons. Readable at arm's length on a phone.
 */
export default function EvaScreen() {
  const setMode = useView((s) => s.setMode)
  const stations = useData((s) => s.stations)
  const result = usePlan((s) => s.result)
  const params = usePlanParams((s) => s.params)
  const estimate = usePosition((s) => s.estimate)
  const uncertaintyM = usePosition((s) => s.uncertaintyM)
  const nextId = usePosition(selectNextStop)
  const fixPrompt = usePosition(selectFixPrompt)
  const timeLeftS = usePosition((s) => (params ? selectTimeLeftS(s, params.timeLimitS) : NaN))
  const addPin = usePins((s) => s.addPin)
  const wayHomeS = useWayHomeS(estimate)
  const [toast, setToast] = useState<string | null>(null)

  useEffect(() => {
    if (!toast) return
    const id = setTimeout(() => setToast(null), 2500)
    return () => clearTimeout(id)
  }, [toast])

  const known = Number.isFinite(estimate.lat) && Number.isFinite(estimate.lon)
  const next = stations.find((s) => s.id === nextId) ?? null
  const fixId = fixPrompt ?? (known ? nearestStationId(stations, estimate) : null)
  const status = result ? STATUS_STYLE[result.status] : null

  const wayHome = Number.isNaN(wayHomeS) ? DASH : Number.isFinite(wayHomeS) ? fmtDuration(wayHomeS) : 'no path'

  return (
    <div className="flex h-dvh w-screen flex-col overflow-y-auto bg-bg font-sans text-fg">
      <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-2">
        {status ? (
          <span className={`rounded-md border-2 px-4 py-2 text-xl font-bold tracking-wider ${status.cls}`}>
            {status.label}
          </span>
        ) : (
          <span className="text-lg text-fg-muted">No plan</span>
        )}
        <button
          type="button"
          onClick={() => setMode('plan')}
          className="min-h-14 rounded-md border-2 border-fg px-5 text-lg font-semibold"
        >
          Exit EVA
        </button>
      </header>

      <main className="flex flex-1 flex-col gap-4 px-4 py-4 sm:gap-6">
        <Block label="Next stop" source="Straight line on the Mars sphere from the simulated position">
          {next ? (
            <>
              <div className="text-2xl font-bold leading-tight sm:text-3xl">
                {next.id} · {next.name}
              </div>
              <div className="font-mono text-3xl font-bold whitespace-nowrap sm:text-4xl">
                {known ? `${fmtDistance(distanceM(estimate, next))}  ${fmtBearing(bearingDeg(estimate, next))}` : DASH}
              </div>
            </>
          ) : (
            <div className="text-3xl font-bold">{result ? 'Walk finished' : DASH}</div>
          )}
        </Block>

        <div className="grid grid-cols-2 gap-4">
          <Block label="Time left" source="Time limit minus simulated elapsed time">
            <div className="font-mono text-2xl font-bold whitespace-nowrap sm:text-3xl">{fmtSignedDuration(timeLeftS)}</div>
          </Block>
          <Block label="Way home" source="Route model, from the simulated position">
            <div className="font-mono text-2xl font-bold whitespace-nowrap sm:text-3xl">{known ? wayHome : DASH}</div>
          </Block>
        </div>

        <Block label="Uncertainty" source="drift_fraction (team placeholder) × distance since the last fix">
          <div className="flex items-baseline gap-3">
            <span className="font-mono text-2xl font-bold sm:text-3xl">{fmtUncertainty(uncertaintyM)}</span>
            <span className="rounded border border-route px-2 py-0.5 text-sm font-semibold uppercase tracking-wider text-route">
              Simulated
            </span>
          </div>
        </Block>

        {result && <p className="text-sm leading-snug text-fg sm:text-base">{result.reason}</p>}

        <div className="mt-auto grid gap-3">
          <button
            type="button"
            disabled={!fixId}
            onClick={() => {
              if (!fixId) return
              usePosition.getState().fixAt(fixId)
              setToast(`Fix confirmed at ${fixId}`)
            }}
            className={`min-h-16 rounded-lg border-2 px-4 text-2xl font-bold disabled:opacity-40 ${
              fixPrompt ? 'border-route bg-route text-bg' : 'border-route text-route'
            }`}
          >
            {fixId ? `Confirm fix at ${fixId}` : 'Confirm fix'}
          </button>
          <button
            type="button"
            disabled={!known}
            onClick={() => {
              addPin('hazard', estimate)
              setToast('Hazard marked at the simulated position')
            }}
            className="min-h-16 rounded-lg border-2 border-pin-hazard px-4 text-2xl font-bold text-pin-hazard disabled:opacity-40"
          >
            Mark hazard
          </button>
          <p role="status" aria-live="polite" className="min-h-6 text-center text-sm text-fg sm:text-base">
            {toast}
          </p>
        </div>
      </main>
    </div>
  )
}
