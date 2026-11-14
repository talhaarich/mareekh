import { describe, expect, it, vi } from 'vitest'
import type { Grid } from '../lib/grid'
import type { PlanResult } from '../lib/plan'
import type { FromWorker, ToWorker } from '../workers/messages'
import { useData, type Station } from './data'
import { createPlanStore, type WorkerLike } from './plan'

/** A worker that records requests; the test decides when and in what order replies arrive. */
function fakeWorker() {
  const sent: ToWorker[] = []
  const w: WorkerLike = { postMessage: (m) => sent.push(m), onmessage: null }
  const reply = (m: FromWorker) => w.onmessage?.({ data: m } as MessageEvent<FromWorker>)
  return { w, sent, reply }
}

const result = (reason: string) => ({ reason }) as PlanResult
const stations = [] as Station[]
const params = { slopeLimitDeg: 15, carriedKg: 0, timeLimitS: 21600 }

describe('plan store', () => {
  it('sends a plan request and stores the reply', () => {
    const f = fakeWorker()
    const { usePlan } = createPlanStore(() => f.w)
    usePlan.getState().requestPlan(stations, params)
    expect(usePlan.getState().busy).toBe(true)
    expect(f.sent[0]).toMatchObject({ type: 'plan', params })
    f.reply({ type: 'planResult', requestId: f.sent[0].requestId, result: result('first') })
    expect(usePlan.getState()).toMatchObject({ busy: false, result: { reason: 'first' } })
  })

  it('ignores a reply older than the latest request, even if it arrives last', () => {
    const f = fakeWorker()
    const { usePlan } = createPlanStore(() => f.w)
    usePlan.getState().requestPlan(stations, params)
    usePlan.getState().requestPlan(stations, { ...params, slopeLimitDeg: 20 })
    const [older, newer] = f.sent.map((m) => m.requestId)
    f.reply({ type: 'planResult', requestId: newer, result: result('newer') })
    f.reply({ type: 'planResult', requestId: older, result: result('older') })
    expect(usePlan.getState().result?.reason).toBe('newer')
  })

  it('stays busy until the latest request is answered', () => {
    const f = fakeWorker()
    const { usePlan } = createPlanStore(() => f.w)
    usePlan.getState().requestPlan(stations, params)
    usePlan.getState().requestPlan(stations, params)
    f.reply({ type: 'planResult', requestId: f.sent[0].requestId, result: result('older') })
    expect(usePlan.getState().busy).toBe(true)
  })

  it('clears the result on an error for the latest request', () => {
    const f = fakeWorker()
    const { usePlan } = createPlanStore(() => f.w)
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    usePlan.getState().requestPlan(stations, params)
    f.reply({ type: 'planResult', requestId: f.sent[0].requestId, result: result('ok') })
    usePlan.getState().requestPlan(stations, params)
    f.reply({ type: 'error', requestId: f.sent[1].requestId, message: 'slope.bin: HTTP 404' })
    expect(usePlan.getState()).toMatchObject({ busy: false, result: null })
    expect(log).toHaveBeenCalledWith('Planner error:', 'slope.bin: HTTP 404')
    log.mockRestore()
  })

  it('answers walkHomeS from the latest field only', () => {
    const grid: Grid = {
      meta: { width: 2, height: 1, resM: 20, bounds: [18, 77, 18.001, 77.002], nodata: -9999, dem: 'dem.bin', slope: 'slope.bin' },
      dem: new Float32Array(2),
      slope: new Float32Array(2),
    }
    useData.setState({ grid })
    const f = fakeWorker()
    const { usePlan, walkHomeS } = createPlanStore(() => f.w)
    const west = { lat: 18.0005, lon: 77.0005 }
    expect(walkHomeS(west)).toBeNaN() // nothing computed yet
    usePlan.getState().requestWalkHome(west, params)
    usePlan.getState().requestWalkHome(west, params)
    f.reply({ type: 'walkHomeResult', requestId: f.sent[1].requestId, field: new Float32Array([0, 30]) })
    f.reply({ type: 'walkHomeResult', requestId: f.sent[0].requestId, field: new Float32Array([0, 999]) })
    expect(walkHomeS({ lat: 18.0005, lon: 77.0015 })).toBe(30)
    expect(walkHomeS({ lat: 0, lon: 0 })).toBe(Infinity)
    useData.setState({ grid: null })
  })
})
