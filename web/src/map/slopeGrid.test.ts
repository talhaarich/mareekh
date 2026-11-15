import { describe, expect, it } from 'vitest'
import {
  classifySlope,
  gridCorners,
  hexToRgba,
  slopeGridPixels,
  slopeShares,
  SLOPE_NODATA,
  SLOPE_OVER_HARD,
  SLOPE_OVER_PLAN,
  SLOPE_WALKABLE,
} from './slopeGrid'

describe('slope grid', () => {
  const slope = new Float32Array([0, 15, 15.5, 20, 20.01, -9999, NaN])

  it('classes cells like the planner: at or under the limit is walkable', () => {
    expect(Array.from(classifySlope(slope, -9999, 15, 20))).toEqual([
      SLOPE_WALKABLE,
      SLOPE_WALKABLE, // exactly at the limit is allowed
      SLOPE_OVER_PLAN,
      SLOPE_OVER_PLAN,
      SLOPE_OVER_HARD,
      SLOPE_NODATA,
      SLOPE_NODATA,
    ])
  })

  it('follows the slider: a higher plan limit opens more cells', () => {
    expect(Array.from(classifySlope(slope, -9999, 20, 20)).slice(0, 5)).toEqual([1, 1, 1, 1, 3])
  })

  it('paints one RGBA pixel per cell, no data transparent', () => {
    const px = slopeGridPixels(new Uint8Array([1, 0, 3]), { 1: [0, 255, 0, 100], 2: [255, 200, 0, 100], 3: [255, 0, 0, 100] })
    expect(Array.from(px)).toEqual([0, 255, 0, 100, 0, 0, 0, 0, 255, 0, 0, 100])
  })

  it('reports shares of each class, ignoring no data', () => {
    expect(slopeShares(new Uint8Array([1, 1, 2, 3, 0]))).toEqual({ walkable: 0.5, overPlan: 0.25, overHard: 0.25 })
  })

  it('parses token colours', () => {
    expect(hexToRgba('#22c55e', 180)).toEqual([34, 197, 94, 180])
    expect(hexToRgba('#fff', 255)).toEqual([255, 255, 255, 255])
  })

  it('places the picture on the grid bounds, top-left first', () => {
    expect(gridCorners([18.4, 77.3, 18.5, 77.5])).toEqual([
      [77.3, 18.5],
      [77.5, 18.5],
      [77.5, 18.4],
      [77.3, 18.4],
    ])
  })
})
