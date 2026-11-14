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
  result: PlanResult | null
  busy: boolean
  /** Plans the walk through `stations` (walking order, base first). Replaces any request still running. */
  requestPlan: (stations: Station[], params: PlanParams) => void
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
  let field: Float32Array | null = null

  const usePlan = create<PlanState>()((set) => {
    const getWorker = (): WorkerLike => {
      if (worker) return worker
      const w = makeWorker()
      w.onmessage = ({ data: m }) => {
        if (m.type === 'planResult') {
          if (m.requestId === latestPlan) set({ result: m.result, busy: false })
        } else if (m.type === 'walkHomeResult') {
          if (m.requestId === latestHome) field = m.field
        } else {
          if (m.requestId === latestPlan) set({ result: null, busy: false })
          if (m.requestId === latestPlan || m.requestId === latestHome) console.error('Planner error:', m.message)
        }
      }
      worker = w
      return w
    }

    return {
      result: null,
      busy: false,
      requestPlan: (stations, params) => {
        latestPlan = nextId++
        set({ busy: true })
        getWorker().postMessage({ type: 'plan', requestId: latestPlan, stations, params })
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
