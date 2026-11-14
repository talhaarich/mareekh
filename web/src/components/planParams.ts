import { useEffect } from 'react'
import { create } from 'zustand'
import type { PlanParams } from '../lib/plan'
import { assumptionValue, useData, type Assumption } from '../state/data'
import { usePlan } from '../state/plan'

/**
 * The `params` slice (PLANNER_API.md): written only by the sliders, read by the planner.
 * Lives in components/ because the brief lists no file for it; move it if the team prefers state/.
 */
interface ParamsState {
  /** null until assumptions.json has loaded: the defaults come from it, never from constants here. */
  params: PlanParams | null
  init: (assumptions: Assumption[]) => void
  /** Called when a slider is released. Does nothing if nothing changed, so no needless replan. */
  commit: (patch: Partial<PlanParams>) => void
}

export const usePlanParams = create<ParamsState>()((set, get) => ({
  params: null,
  init: (assumptions) => {
    if (get().params) return
    set({
      params: {
        slopeLimitDeg: assumptionValue(assumptions, 'slope_limit_plan_deg'),
        carriedKg: 0,
        timeLimitS: assumptionValue(assumptions, 'eva_time_limit_s'),
      },
    })
  },
  commit: (patch) => {
    const cur = get().params
    if (!cur) return
    const next = { ...cur, ...patch }
    if (
      next.slopeLimitDeg === cur.slopeLimitDeg &&
      next.carriedKg === cur.carriedKg &&
      next.timeLimitS === cur.timeLimitS
    )
      return
    set({ params: next })
  },
}))

/**
 * Starts the planner: initialises the params once data has loaded, then asks for one new plan and
 * one new walk-home field whenever params change ("changing params triggers one replan").
 * Call once, near the top of the app.
 */
export function usePlanner(): void {
  const loaded = useData((s) => s.loaded)
  const assumptions = useData((s) => s.assumptions)
  const stations = useData((s) => s.stations)
  const params = usePlanParams((s) => s.params)
  const init = usePlanParams((s) => s.init)

  useEffect(() => {
    if (loaded) init(assumptions)
  }, [loaded, assumptions, init])

  useEffect(() => {
    if (!loaded || !params || stations.length === 0) return
    const base = { lat: stations[0].lat, lon: stations[0].lon }
    usePlan.getState().requestPlan(stations, params)
    usePlan.getState().requestWalkHome(base, params)
  }, [loaded, params, stations])
}
