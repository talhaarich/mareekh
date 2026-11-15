import { describe, expect, it } from 'vitest'
import { nextStationId } from './nextStation'

// Flat-plane distance is enough to test the choice.
const dist = (a: { lat: number; lon: number }, b: { lat: number; lon: number }) => Math.hypot(a.lat - b.lat, a.lon - b.lon)
const P = (lat: number, lon: number) => ({ lat, lon })

// B (0,0) -> S1 (0,1) -> S2 (1,1) -> B
const legs = [
  { fromId: 'B', toId: 'S1', ok: true, path: [P(0, 0), P(0, 0.5), P(0, 1)] },
  { fromId: 'S1', toId: 'S2', ok: true, path: [P(0, 1), P(0.5, 1), P(1, 1)] },
  { fromId: 'S2', toId: 'B', ok: true, path: [P(1, 1), P(0.5, 0.5), P(0, 0)] },
]

describe('ground view: which station to face', () => {
  it('from base, the walk’s first station; from a station, the next one', () => {
    expect(nextStationId(legs, P(0, 0), 'B', dist)).toBe('S1')
    expect(nextStationId(legs, P(0, 1), 'S1', dist)).toBe('S2')
    expect(nextStationId(legs, P(1, 1), 'S2', dist)).toBe('B')
  })

  it('from any other point, the end of the leg that passes closest', () => {
    expect(nextStationId(legs, P(0.45, 1.1), null, dist)).toBe('S2')
    expect(nextStationId(legs, P(0.6, 0.4), null, dist)).toBe('B')
    // A station that is not in the walk is treated like any other point.
    expect(nextStationId(legs, P(-0.1, 0.45), 'S7', dist)).toBe('S1')
  })

  it('skips legs with no route, and is null with no plan', () => {
    const broken = [{ ...legs[0], ok: false, path: [] }, legs[1], legs[2]]
    expect(nextStationId(broken, P(0.1, 0.9), null, dist)).toBe('S2')
    expect(nextStationId(null, P(0, 0), 'B', dist)).toBeNull()
    expect(nextStationId([], P(0, 0), 'B', dist)).toBeNull()
  })
})
