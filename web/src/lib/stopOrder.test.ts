import { describe, expect, it } from 'vitest'
import { insertStops } from './stopOrder'

type P = { id: string; x: number; y: number }
const p = (id: string, x: number, y: number): P => ({ id, x, y })
const d = (a: P, b: P) => Math.hypot(a.x - b.x, a.y - b.y)
const ids = (r: P[]) => r.map((s) => s.id)

describe('insertStops', () => {
  const B = p('B', 0, 0)
  const walk = [B, p('W', -10, 0), p('S', 0, -10)] // B -> west -> south -> B

  it('puts a stop on the way out where it costs least, keeping the walk order', () => {
    expect(ids(insertStops(walk, [p('mid', -5, 0)], d))).toEqual(['B', 'mid', 'W', 'S'])
  })

  it('can use the walk home', () => {
    expect(ids(insertStops(walk, [p('home', 0, -4)], d))).toEqual(['B', 'W', 'S', 'home'])
  })

  it('inserts several, each into the walk as it stands', () => {
    expect(ids(insertStops(walk, [p('mid', -5, 0), p('sw', -6, -6)], d))).toEqual(['B', 'mid', 'W', 'sw', 'S'])
  })

  it('handles a walk with no stops yet, and nothing to add', () => {
    expect(ids(insertStops([B], [p('a', 1, 1)], d))).toEqual(['B', 'a'])
    expect(insertStops(walk, [], d)).toEqual(walk)
  })
})
