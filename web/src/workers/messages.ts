/** Worker messages, exactly as in docs/specs/PLANNER_API.md. */

import type { LatLon } from '../lib/mars'
import type { PlanParams, PlanResult } from '../lib/plan'
import type { Station } from '../state/data'

export type ToWorker =
  | { type: 'plan'; requestId: number; stations: Station[]; params: PlanParams }
  | { type: 'walkHome'; requestId: number; base: LatLon; params: PlanParams }

export type FromWorker =
  | { type: 'planResult'; requestId: number; result: PlanResult }
  /** Seconds to base per cell, grid layout, Infinity when unreachable. */
  | { type: 'walkHomeResult'; requestId: number; field: Float32Array }
  | { type: 'error'; requestId: number; message: string }
