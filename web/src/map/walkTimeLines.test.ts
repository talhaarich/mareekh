import { describe, expect, it } from 'vitest'
import { walkTimeLines } from './walkTimeLines'

describe('walk-time lines', () => {
  // 1 x 8 strip, time rising eastwards by 10 min per cell
  const field = Float32Array.from([0, 600, 1200, 1800, 2400, 3000, 3600, 4200])

  it('draws a line on the inside of each 30-min contour, up to the last one', () => {
    const { level } = walkTimeLines(field, 8, 1, 1800, 3600)
    // 20 min sits next to 30 min -> the 30-min line; 50 min sits next to 60 -> the 60-min line.
    expect(Array.from(level)).toEqual([0, 0, 1, 0, 0, 2, 0, 0])
  })

  it('draws nothing beyond the last line or next to unreachable ground', () => {
    // 1000 s next to 2000 s -> the 30-min line. 2000 s and 5000 s only touch unreachable ground: no line.
    const f = Float32Array.from([0, 1000, 2000, Infinity, 5000])
    expect(Array.from(walkTimeLines(f, 5, 1, 1800, 5400).level)).toEqual([0, 1, 0, 0, 0])
  })

  it('labels each line at its northernmost cell', () => {
    // 2 rows: the 30-min boundary appears in both rows; the label takes row 0.
    const f = Float32Array.from([0, 2000, 0, 2000])
    const { labelCell } = walkTimeLines(f, 2, 2, 1800, 3600)
    expect(labelCell[1]).toBe(0)
    expect(labelCell[2]).toBeNull()
  })
})
