/**
 * The slope grid the route planner uses, as a picture (pure, no DOM). Each cell is classed against
 * the plan's slope limit (the slider) and the hard limit (slope_limit_hard_deg), the same test the
 * planner applies: a cell above the plan limit is blocked.
 */

/** Class per cell. */
export const SLOPE_NODATA = 0
export const SLOPE_WALKABLE = 1
/** Above the plan limit but not the hard limit: blocked now, open with "steeper" route B. */
export const SLOPE_OVER_PLAN = 2
export const SLOPE_OVER_HARD = 3

export function classifySlope(slope: Float32Array, nodata: number, planLimitDeg: number, hardLimitDeg: number): Uint8Array {
  const out = new Uint8Array(slope.length)
  for (let i = 0; i < slope.length; i++) {
    const s = slope[i]
    if (s === nodata || !Number.isFinite(s)) out[i] = SLOPE_NODATA
    else if (s <= planLimitDeg) out[i] = SLOPE_WALKABLE
    else if (s <= hardLimitDeg) out[i] = SLOPE_OVER_PLAN
    else out[i] = SLOPE_OVER_HARD
  }
  return out
}

export type Rgba = [number, number, number, number]

/** RGBA pixels, one per cell, north row first (the grid's own order). Class 0 (no data) is transparent. */
export function slopeGridPixels(classes: Uint8Array, colours: Record<1 | 2 | 3, Rgba>): Uint8ClampedArray<ArrayBuffer> {
  const px = new Uint8ClampedArray(classes.length * 4)
  for (let i = 0; i < classes.length; i++) {
    const c = classes[i]
    if (c === SLOPE_NODATA) continue
    px.set(colours[c as 1 | 2 | 3], i * 4)
  }
  return px
}

/** Share of cells in each class, 0..1, ignoring no data. For the legend. */
export function slopeShares(classes: Uint8Array): { walkable: number; overPlan: number; overHard: number } {
  let w = 0
  let p = 0
  let h = 0
  for (const c of classes) {
    if (c === SLOPE_WALKABLE) w++
    else if (c === SLOPE_OVER_PLAN) p++
    else if (c === SLOPE_OVER_HARD) h++
  }
  const n = w + p + h || 1
  return { walkable: w / n, overPlan: p / n, overHard: h / n }
}

/** Parse a CSS colour token like "#22c55e" into RGBA with the given alpha (0..255). */
export function hexToRgba(hex: string, alpha: number): Rgba {
  const h = hex.trim().replace('#', '')
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h.slice(0, 6)
  const n = Number.parseInt(full, 16)
  if (!Number.isFinite(n)) return [0, 0, 0, 0]
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255, alpha]
}

/** MapLibre image corners (TL, TR, BR, BL as [lon, lat]) for grid bounds [south, west, north, east]. */
export function gridCorners(bounds: [number, number, number, number]): [[number, number], [number, number], [number, number], [number, number]] {
  const [s, w, n, e] = bounds
  return [
    [w, n],
    [e, n],
    [e, s],
    [w, s],
  ]
}
