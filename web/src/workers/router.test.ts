import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { cellIndex, cellToLatLon, type FetchFile } from '../lib/grid'
import type { Station } from '../state/data'
import { createRouter, loadRouterData } from './router'

const examples = new URL('../../../examples/data/', import.meta.url)
// Grid from the tiny example, assumptions from the Jezero example, as the worker would fetch them.
const files: FetchFile = async (name) => {
  try {
    const dir = name === 'assumptions.json' ? 'jezero' : 'tiny'
    return new Response(await readFile(new URL(`${dir}/${name}`, examples)))
  } catch {
    return new Response(null, { status: 404 })
  }
}

const data = await loadRouterData(files)
const meta = data.grid.meta
const st = (id: string, row: number, col: number, dwellS: number): Station => ({ id, name: id, ...cellToLatLon(meta, row, col), task: '', dwellS, sol: null, photos: [] })
const params = { slopeLimitDeg: 15, carriedKg: 0, timeLimitS: 21600 }

describe('router worker handler', () => {
  const handle = createRouter(Promise.resolve(data))

  it('answers a plan request with a PlanResult and the same requestId', async () => {
    const { reply } = await handle({ type: 'plan', requestId: 7, stations: [st('B', 2, 0, 0), st('S1', 2, 7, 600)], params })
    expect(reply.type).toBe('planResult')
    if (reply.type !== 'planResult') return
    expect(reply.requestId).toBe(7)
    expect(reply.result.status).toBe('go')
    expect(reply.result.legs).toHaveLength(2)
  })

  it('answers a walk-home request with a Float32 field in grid layout, transferring its buffer', async () => {
    const base = { lat: cellToLatLon(meta, 2, 0).lat, lon: cellToLatLon(meta, 2, 0).lon }
    const { reply, transfer } = await handle({ type: 'walkHome', requestId: 8, base, params })
    expect(reply.type).toBe('walkHomeResult')
    if (reply.type !== 'walkHomeResult') return
    expect(reply.field).toBeInstanceOf(Float32Array)
    expect(reply.field).toHaveLength(meta.width * meta.height)
    expect(reply.field[cellIndex(meta, 2, 0)]).toBe(0)
    expect(transfer).toEqual([reply.field.buffer])
  })

  it('turns a bad request into an error reply instead of crashing', async () => {
    const { reply } = await handle({ type: 'plan', requestId: 9, stations: [st('B', 2, 0, 0)], params })
    expect(reply).toEqual({ type: 'error', requestId: 9, message: 'A plan needs base and at least one station' })
  })

  it('reports a data file that failed to load, on every request', async () => {
    const missing: FetchFile = async (name) => (name === 'slope.bin' ? new Response(null, { status: 404 }) : files(name))
    const broken = createRouter(loadRouterData(missing))
    const { reply } = await broken({ type: 'plan', requestId: 1, stations: [st('B', 2, 0, 0), st('S1', 2, 7, 0)], params })
    expect(reply).toEqual({ type: 'error', requestId: 1, message: 'slope.bin: HTTP 404' })
  })
})
