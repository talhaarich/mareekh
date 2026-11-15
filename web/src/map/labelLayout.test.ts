import { describe, expect, it } from 'vitest'
import { layoutLabels, overlapArea, segmentInRect, wrapLabel, type LabelInput, type Rect } from './labelLayout'

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


describe('labels and the route line', () => {
  it('measures how much of a segment lies inside a box', () => {
    const box = { x: 0, y: 0, w: 10, h: 10 }
    expect(segmentInRect({ x1: -5, y1: 5, x2: 15, y2: 5 }, box)).toBeCloseTo(10, 9) // straight through
    expect(segmentInRect({ x1: 2, y1: 2, x2: 4, y2: 2 }, box)).toBeCloseTo(2, 9) // wholly inside
    expect(segmentInRect({ x1: 20, y1: 0, x2: 30, y2: 0 }, box)).toBe(0) // outside
  })

  it('moves a label off the route when there is room', () => {
    // A marker on a horizontal route: the first-choice spot (to the right) sits on the line.
    const label: LabelInput = { id: 'A', ax: 300, ay: 300, w: 100, h: 20 }
    const route = [{ x1: 0, y1: 300, x2: 800, y2: 300 }]
    const [free] = layoutLabels([label], { width: 800, height: 600, obstacles: [] })
    expect(segmentInRect(route[0], free)).toBeGreaterThan(0) // without the route it would cover it
    const [avoided] = layoutLabels([label], { width: 800, height: 600, obstacles: [], lines: route })
    expect(segmentInRect(route[0], avoided)).toBe(0)
  })
})


describe('wrapLabel', () => {
  const measure = (s: string) => s.length * 7 // 7 px per character
  it('keeps short labels on one line', () => {
    expect(wrapLabel('Base', measure, 170)).toEqual(['Base'])
  })
  it('splits long labels into two balanced lines at a space', () => {
    expect(wrapLabel('Delta front, top of Hawksbill Gap', measure, 170)).toEqual(['Delta front, top', 'of Hawksbill Gap'])
  })
  it('leaves a single long word alone', () => {
    expect(wrapLabel('Supercalifragilisticexpialidocious', measure, 100)).toEqual(['Supercalifragilisticexpialidocious'])
  })

  it('keeps labels off panel areas even at the cost of a farther spot', () => {
    // A panel covers the right quarter; the marker sits just left of it, where its first choice (to the right) would go.
    const panel = { x: 300, y: 0, w: 100, h: 300 }
    const [l] = layoutLabels([{ id: 'a', ax: 280, ay: 150, w: 80, h: 20 }], { width: 400, height: 300, obstacles: [], keepOut: [panel] })
    expect(overlapArea(l, panel)).toBe(0)
    expect(l.x + l.w).toBeLessThanOrEqual(300)
  })
})
