import { describe, expect, it } from 'vitest'
import type { Station } from '../state/data'
import { defaultStops, toggleStop, walkStations } from './walkStops'

const st = (id: string, sol: number | null, lon = 0): Station => ({ id, name: id, lat: 0, lon, task: '', dwellS: 0, sol, photos: [] })
const stations = [st('B', null, 0), st('S1', 686, -10), st('S2', 437, -20), st('S3', null, -5), st('S4', null, 30)]
const dist = (a: Station, b: Station) => Math.abs(a.lon - b.lon)

describe('walk stops', () => {
  it('defaults to the rover stops (stations with a sol)', () => {
    expect(defaultStops(stations)).toEqual(['S1', 'S2'])
    expect(walkStations(stations, null, dist).map((s) => s.id)).toEqual(['B', 'S1', 'S2'])
  })

  it('adds a stop in walking order and removes it again', () => {
    const added = toggleStop(stations, null, 'S3')
    expect(added).toEqual(['S1', 'S2', 'S3'])
    expect(toggleStop(stations, added, 'S1')).toEqual(['S2', 'S3'])
    // S4 (east) either before or after S1 (west) is the same loop and costs the same: the first gap wins.
    expect(walkStations(stations, ['S4', 'S1'], dist).map((s) => s.id)).toEqual(['B', 'S4', 'S1'])
  })

  it('fits an added mapped stop in where it costs least, keeping the rover stops in order', () => {
    // S3 at lon -5 lies on the way out to S1 (-10): B -> S3 -> S1 -> S2 -> B
    expect(walkStations(stations, ['S1', 'S2', 'S3'], dist).map((s) => s.id)).toEqual(['B', 'S3', 'S1', 'S2'])
  })

  it('keeps at least one stop', () => {
    expect(toggleStop(stations, ['S2'], 'S2')).toEqual(['S2'])
  })
})
