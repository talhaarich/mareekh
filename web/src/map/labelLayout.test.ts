import { describe, expect, it } from 'vitest'
import { layoutLabels, overlapArea, type LabelInput, type Rect } from './labelLayout'

const W = 1087
const H = 840
const R = 14
// The cluster from the first build: S1, S2 and S3 sit almost on top of each other, base is apart.
const inputs: LabelInput[] = [
  { id: 'B', ax: 855, ay: 319, w: 70, h: 20 },
  { id: 'S1', ax: 765, ay: 308, w: 120, h: 20 },
  { id: 'S2', ax: 755, ay: 291, w: 100, h: 20 },
  { id: 'S3', ax: 738, ay: 265, w: 100, h: 20 },
]
const controls: Rect[] = [{ x: 1038, y: 47, w: 38, h: 108 }]

describe('layoutLabels', () => {
  const placed = layoutLabels(inputs, { width: W, height: H, obstacles: controls, markerRadius: R })

  it('places every label', () => {
    expect(placed.map((p) => p.id).sort()).toEqual(['B', 'S1', 'S2', 'S3'])
  })

  it('never overlaps two labels', () => {
    for (let i = 0; i < placed.length; i++)
      for (let j = i + 1; j < placed.length; j++) expect(overlapArea(placed[i], placed[j])).toBe(0)
  })

  it('never covers a marker or an on-map control', () => {
    for (const p of placed) {
      for (const i of inputs)
        expect(overlapArea(p, { x: i.ax - R, y: i.ay - R, w: 2 * R, h: 2 * R })).toBe(0)
      for (const c of controls) expect(overlapArea(p, c)).toBe(0)
    }
  })

  it('stays on screen', () => {
    for (const p of placed) expect(overlapArea(p, { x: 0, y: 0, w: W, h: H })).toBe(p.w * p.h)
  })

  it('draws a leader line for a label that is not touching its marker', () => {
    const far = placed.filter((p) => p.leader !== null)
    expect(far.length).toBeGreaterThan(0)
  })

  it('keeps a lone label right beside its marker with no leader line', () => {
    const [one] = layoutLabels([inputs[0]], { width: W, height: H, obstacles: [], markerRadius: R })
    expect(one.leader).toBeNull()
    expect(one.x).toBeGreaterThanOrEqual(inputs[0].ax)
  })

  it('moves a label off the screen edge', () => {
    const [one] = layoutLabels([{ id: 'E', ax: W - 5, ay: 100, w: 90, h: 20 }], {
      width: W,
      height: H,
      obstacles: [],
      markerRadius: R,
    })
    expect(one.x + one.w).toBeLessThanOrEqual(W)
  })
})
