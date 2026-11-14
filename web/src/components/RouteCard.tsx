import { useMemo } from 'react'
import { stationSchedule } from '../lib/schedule'
import { walkTimeline } from '../lib/timeline'
import { useData } from '../state/data'
import { usePlan } from '../state/plan'
import { fmtDistance, fmtDuration } from './format'
import { usePlanParams } from './planParams'
import { STATUS_STYLE } from './status'

/** Planned stops for the current plan, from the walk timeline (lib does the maths). */
function useSchedule() {
  const grid = useData((s) => s.grid)
  const assumptions = useData((s) => s.assumptions)
  const stations = useData((s) => s.stations)
  const result = usePlan((s) => s.result)
  return useMemo(
    () => (result && grid ? stationSchedule(walkTimeline(grid, assumptions, stations, result)) : []),
    [result, grid, assumptions, stations],
  )
}

/** Button for the plan panel. Printing shows only the route card (see App and the print: classes). */
export function PrintRouteCardButton() {
  const result = usePlan((s) => s.result)
  if (!result) return null
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="rounded border border-line px-2 py-1 text-xs text-fg-muted hover:text-fg"
    >
      Print route card
    </button>
  )
}

/**
 * One printable page: the stations in walking order with planned arrival and departure times and one
 * task line each. Hidden on screen; printed in black on white so it reads on paper.
 */
export default function RouteCard() {
  const manifest = useData((s) => s.manifest)
  const stations = useData((s) => s.stations)
  const result = usePlan((s) => s.result)
  const params = usePlanParams((s) => s.params)
  const schedule = useSchedule()

  if (!result || !params) return null
  const byId = new Map(stations.map((s) => [s.id, s]))

  return (
    <article aria-label="Route card" className="hidden bg-paper p-6 font-sans text-[11pt] text-ink print:block">
      <header className="mb-3 border-b-2 border-ink pb-2">
        <h1 className="text-[16pt] font-bold">Route card · {manifest?.region.name ?? 'Walk'}</h1>
        <p>
          Status: <strong>{STATUS_STYLE[result.status].label}</strong> · {result.reason}
        </p>
        <p>
          Total {fmtDuration(result.totalTimeS)} of a {fmtDuration(params.timeLimitS)} limit ·{' '}
          {fmtDistance(result.distanceM)} · slope limit {params.slopeLimitDeg}° · carried {params.carriedKg} kg
        </p>
        <p>
          {result.turnBack
            ? `Turn back by ${fmtDuration(result.turnBack.elapsedS)} into the walk.`
            : 'No turn-back point: every point on the route fits the time limit.'}
        </p>
      </header>

      {schedule.length === 0 ? (
        <p>No route through the stations under the current slope limit.</p>
      ) : (
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-ink text-left">
              <th className="py-1 pr-2">Stop</th>
              <th className="py-1 pr-4">Arrive</th>
              <th className="py-1 pr-4">Leave</th>
              <th className="py-1">Task</th>
            </tr>
          </thead>
          <tbody>
            {schedule.map((s, i) => {
              const st = byId.get(s.stationId)
              const first = i === 0
              const last = i === schedule.length - 1
              return (
                <tr key={`${s.stationId}-${i}`} className="break-inside-avoid border-b border-ink/30 align-top">
                  <td className="py-1.5 pr-2 font-bold whitespace-nowrap">
                    {s.stationId} · {st?.name ?? ''}
                  </td>
                  <td className="py-1.5 pr-4 font-mono whitespace-nowrap">{first ? '—' : `T+${fmtDuration(s.arriveS)}`}</td>
                  <td className="py-1.5 pr-4 font-mono whitespace-nowrap">{last ? '—' : `T+${fmtDuration(s.departS)}`}</td>
                  <td className="py-1.5">{first ? 'Leave base.' : last ? 'Back at base.' : st?.task}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}

      <footer className="mt-3 text-[8pt]">
        T+ is time since leaving base. Times, distance and turn-back: route model over the height grid with the team
        speed model (Apollo-based speeds), slope and time limits from assumptions.json and the plan settings. Planning
        and rehearsal only, not mission-critical.
      </footer>
    </article>
  )
}
