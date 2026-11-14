import { describe, expect, it } from 'vitest'
import { edgeArrow } from './edgeArrow'

const W = 800
const H = 600
const INSET = 24

describe('edge arrow', () => {
  it('is null for a point on screen', () => {
    expect(edgeArrow({ x: 400, y: 300 }, W, H, INSET)).toBeNull()
    expect(edgeArrow({ x: INSET, y: H - INSET }, W, H, INSET)).toBeNull()
  })

  it('sits on the right edge, pointing right, for a point far to the right', () => {
    const a = edgeArrow({ x: 5000, y: 300 }, W, H, INSET)!
    expect(a.x).toBeCloseTo(W - INSET, 9)
    expect(a.y).toBeCloseTo(300, 9)
    expect(a.angleDeg).toBeCloseTo(0, 9)
  })

  it('points up (-90) from the top edge and down (90) from the bottom edge', () => {
    const up = edgeArrow({ x: 400, y: -1000 }, W, H, INSET)!
    expect(up).toMatchObject({ x: 400, y: INSET })
    expect(up.angleDeg).toBeCloseTo(-90, 9)
    expect(edgeArrow({ x: 400, y: 9000 }, W, H, INSET)!.angleDeg).toBeCloseTo(90, 9)
  })

  it('clamps a diagonal point to whichever edge the ray hits first, staying inside the inset box', () => {
    const a = edgeArrow({ x: -2000, y: -2000 }, W, H, INSET)!
    expect(a.y).toBeCloseTo(INSET, 9) // the ray from the centre reaches the top before the left
    expect(a.x).toBeGreaterThanOrEqual(INSET)
    expect(a.angleDeg).toBeCloseTo((Math.atan2(-2000 - 300, -2000 - 400) * 180) / Math.PI, 9) // from the screen centre
  })

  it('is null for a point that cannot be projected', () => {
    expect(edgeArrow({ x: NaN, y: 0 }, W, H, INSET)).toBeNull()
  })
})
