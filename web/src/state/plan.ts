/**
 * The `plan` slice (docs/specs/PLANNER_API.md): `result` and `busy`, written only here.
 * Sends requests to the router worker and ignores any reply older than the latest request,
 * so fast slider changes never show a stale result.
 *
 * Also provides the walk-home helper `walkHomeS(p)` from the latest walk-home field.
 */

import { create } from 'zustand'
import { latLonToCell } from '../lib/grid'
import type { LatLon } from '../lib/mars'
import type { PlanParams, PlanResult } from '../lib/plan'
import type { FromWorker, ToWorker } from '../workers/messages'
import { useData, type Station } from './data'

interface PlanState {
  /** Route A: the plan. */
  result: PlanResult | null
  busy: boolean
  /** Route B: one change from the plan (a compare preset). Null when compare is off. */
  compare: PlanResult | null
  /**
   * Plans the walk through `stations` (walking order, base first). Replaces any request still running.
   * Call when params or base change; this also clears `compare`.
   */
  requestPlan: (stations: Station[], params: PlanParams) => void
  /** Plans route B with `params` (built from a compare preset) through the stations of the last plan. */
  requestCompare: (params: PlanParams) => void
  /** Turns compare off. */
  clearCompare: () => void
  /** Recomputes the walk-home field for `base`. */
  requestWalkHome: (base: LatLon, params: PlanParams) => void
}

/** The parts of a Worker the store uses, so tests can pass a fake. */
export interface WorkerLike {
  postMessage(msg: ToWorker): void
  onmessage: ((e: MessageEvent<FromWorker>) => void) | null
}

export function createPlanStore(makeWorker: () => WorkerLike) {
  let worker: WorkerLike | null = null
  let nextId = 1
  let latestPlan = 0
  let latestHome = 0
  let latestCompare = 0
  let lastStations: Station[] = []
  let field: Float32Array | null = null

  const usePlan = create<PlanState>()((set) => {
    const getWorker = (): WorkerLike => {
      if (worker) return worker
      const w = makeWorker()
      w.onmessage = ({ data: m }) => {
        if (m.type === 'planResult') {
          if (m.requestId === latestPlan) set({ result: m.result, busy: false })
          else if (m.requestId === latestCompare) set({ compare: m.result })
        } else if (m.type === 'walkHomeResult') {
          if (m.requestId === latestHome) field = m.field
        } else {
          if (m.requestId === latestPlan) set({ result: null, busy: false })
          if (m.requestId === latestCompare) set({ compare: null })
          if (m.requestId === latestPlan || m.requestId === latestHome || m.requestId === latestCompare) console.error('Planner error:', m.message)
        }
      }
      worker = w
      return w
    }

    return {
      result: null,
      busy: false,
      compare: null,
      requestPlan: (stations, params) => {
        latestPlan = nextId++
        latestCompare = 0 // any compare still running is now stale
        lastStations = stations
        set({ busy: true, compare: null })
        getWorker().postMessage({ type: 'plan', requestId: latestPlan, stations, params })
      },
      requestCompare: (params) => {
        if (lastStations.length === 0) throw new Error('Plan the walk before comparing')
        latestCompare = nextId++
        getWorker().postMessage({ type: 'plan', requestId: latestCompare, stations: lastStations, params })
      },
      clearCompare: () => {
        latestCompare = 0
        set({ compare: null })
      },
      requestWalkHome: (base, params) => {
        latestHome = nextId++
        getWorker().postMessage({ type: 'walkHome', requestId: latestHome, base, params })
      },
    }
  })

  /** Seconds to walk to base from `p`. Infinity when unreachable or off the grid; NaN until the field has been computed. */
  const walkHomeS = (p: LatLon): number => {
    const grid = useData.getState().grid
    if (!field || !grid) return NaN
    const cell = latLonToCell(grid.meta, p)
    return cell ? field[cell.row * grid.meta.width + cell.col] : Infinity
  }

  /** The latest walk-home field (seconds per cell, grid layout), for the 30/60/90-minute lines. Null until computed. */
  const getWalkHomeField = (): Float32Array | null => field

  return { usePlan, walkHomeS, getWalkHomeField }
}

export const { usePlan, walkHomeS, getWalkHomeField } = createPlanStore(
  () => new Worker(new URL('../workers/router.worker.ts', import.meta.url), { type: 'module' }),
)
