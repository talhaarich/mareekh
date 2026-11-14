/**
 * What the router worker does with each message, separate from the worker glue so it can be tested.
 * The plan message carries only stations and params, so the worker loads the grid and assumptions
 * itself, once, from the data folder (team decision; no extra message in the spec).
 */

import { fetchDataFile, loadGrid, type FetchFile, type Grid } from '../lib/grid'
import { readJson } from '../lib/parse'
import { planWalk, walkHomeField } from '../lib/plan'
import { parseAssumptions, type Assumption } from '../state/data'
import type { FromWorker, ToWorker } from './messages'

export interface RouterData {
  grid: Grid
  assumptions: Assumption[]
}

export async function loadRouterData(fetchFile: FetchFile = fetchDataFile): Promise<RouterData> {
  const [grid, assumptions] = await Promise.all([
    loadGrid(fetchFile),
    fetchFile('assumptions.json').then((r) => readJson(r, 'assumptions.json')).then(parseAssumptions),
  ])
  return { grid, assumptions }
}

/** Returns a handler that answers one message, after awaiting `ready` (the loaded grid and assumptions). Never throws: errors become an error reply. */
export function createRouter(ready: Promise<RouterData>) {
  ready.catch(() => {}) // a load failure is reported per message below, not as an unhandled rejection
  return async (msg: ToWorker): Promise<{ reply: FromWorker; transfer: Transferable[] }> => {
    try {
      const { grid, assumptions } = await ready
      if (msg.type === 'plan') {
        return { reply: { type: 'planResult', requestId: msg.requestId, result: planWalk(grid, assumptions, msg.stations, msg.params) }, transfer: [] }
      }
      const field = walkHomeField(grid, assumptions, msg.base, msg.params)
      return { reply: { type: 'walkHomeResult', requestId: msg.requestId, field }, transfer: [field.buffer] }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return { reply: { type: 'error', requestId: msg.requestId, message }, transfer: [] }
    }
  }
}
