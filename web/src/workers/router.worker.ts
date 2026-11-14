/** The router worker: route searches run here so the map keeps panning. Logic is in router.ts. */

import type { ToWorker } from './messages'
import { createRouter, loadRouterData } from './router'

const handle = createRouter(loadRouterData())

self.onmessage = async (e: MessageEvent<ToWorker>) => {
  const { reply, transfer } = await handle(e.data)
  self.postMessage(reply, { transfer })
}
